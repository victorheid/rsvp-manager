import Stripe from "stripe";
import type {
  CardBrand,
  ConnectedAccountState,
  DeclineReason,
  GatewayEvent,
  OffSessionChargeResult,
  PaymentGateway,
  PaymentIntent,
  PaymentIntentState,
  SavedCard,
  SetupIntent,
  SetupIntentState,
} from "@/server/integrations/stripe/types";

/**
 * The real `PaymentGateway`, on Stripe: customers, SetupIntents and
 * PaymentIntents for cards, and Connect (Express accounts, "separate
 * charges and transfers") for organizer payouts. Everything is EUR, in
 * integer cents. The rest of the app only sees the interface in types.ts;
 * `contract.ts` is what keeps this and the fake behaving the same.
 */
const CURRENCY = "eur";
/** §5: single region for the MVP. */
const CONNECT_COUNTRY = "IE";

function toBrand(brand: string | undefined): CardBrand {
  return brand === "visa" || brand === "mastercard" || brand === "amex" ? brand : "unknown";
}

function toCard(paymentMethod: Stripe.PaymentMethod | string | null | undefined): SavedCard | null {
  if (!paymentMethod || typeof paymentMethod === "string" || !paymentMethod.card) {
    return null;
  }

  return { paymentMethodId: paymentMethod.id, brand: toBrand(paymentMethod.card.brand), last4: paymentMethod.card.last4 };
}

function toDeclineReason(code: string | undefined, declineCode: string | undefined): DeclineReason {
  if (code === "expired_card" || declineCode === "expired_card") return "expired_card";
  if (declineCode === "insufficient_funds") return "insufficient_funds";
  return "card_declined";
}

function connectedAccountState(account: Stripe.Account): ConnectedAccountState {
  return {
    accountId: account.id,
    payoutsEnabled: account.details_submitted === true && account.capabilities?.transfers === "active",
  };
}

export function createStripeGateway(secretKey: string, webhookSecret?: string): PaymentGateway {
  const stripe = new Stripe(secretKey);

  return {
    parseWebhook(rawBody, signature): GatewayEvent | null {
      if (!webhookSecret || !signature) {
        throw new Error("Webhooks aren't configured (STRIPE_WEBHOOK_SECRET) or the request wasn't signed");
      }

      // Throws StripeSignatureVerificationError on a bad or replayed signature.
      const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

      switch (event.type) {
        case "payment_intent.succeeded":
        case "payment_intent.payment_failed":
          return { type: "payment_updated", paymentIntentId: event.data.object.id };
        case "account.updated":
          return { type: "account_updated", accountId: event.data.object.id };
        default:
          return null;
      }
    },

    async ensureCustomer(input) {
      const customer = await stripe.customers.create(
        { name: input.name, metadata: { userId: input.userId } },
        { idempotencyKey: `customer:${input.userId}` },
      );

      return { customerId: customer.id };
    },

    async createSetupIntent(input): Promise<SetupIntent> {
      const intent = await stripe.setupIntents.create({
        customer: input.customerId,
        payment_method_types: ["card"],
        usage: "off_session",
      });

      if (!intent.client_secret) throw new Error("Stripe returned a SetupIntent without a client secret");

      return { setupIntentId: intent.id, clientSecret: intent.client_secret };
    },

    async retrieveSetupIntent(setupIntentId): Promise<SetupIntentState> {
      const intent = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });

      if (intent.status === "succeeded") {
        const card = toCard(intent.payment_method);
        if (!card) throw new Error(`SetupIntent ${setupIntentId} succeeded without a card`);
        return { status: "succeeded", card };
      }

      return intent.status === "canceled" ? { status: "failed" } : { status: "pending" };
    },

    async createPaymentIntent(input): Promise<PaymentIntent> {
      const intent = await stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: CURRENCY,
          customer: input.customerId,
          description: input.description,
          payment_method_types: ["card"],
        },
        { idempotencyKey: input.idempotencyKey },
      );

      if (!intent.client_secret) throw new Error("Stripe returned a PaymentIntent without a client secret");

      return { paymentIntentId: intent.id, clientSecret: intent.client_secret };
    },

    async retrievePaymentIntent(paymentIntentId): Promise<PaymentIntentState> {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ["latest_charge", "payment_method"] });

      if (intent.status === "succeeded") {
        const charge = intent.latest_charge;
        const card = toCard(intent.payment_method);
        if (!charge || typeof charge === "string" || !card) {
          throw new Error(`PaymentIntent ${paymentIntentId} succeeded without a charge or card`);
        }
        return { status: "succeeded", chargeId: charge.id, card };
      }

      // A declined attempt puts the intent back to "requires_payment_method" with the error attached.
      if (intent.status === "requires_payment_method" && intent.last_payment_error) {
        return { status: "failed", reason: toDeclineReason(intent.last_payment_error.code, intent.last_payment_error.decline_code) };
      }

      return { status: "pending" };
    },

    async chargeSavedCard(input): Promise<OffSessionChargeResult> {
      try {
        const intent = await stripe.paymentIntents.create(
          {
            amount: input.amountCents,
            currency: CURRENCY,
            customer: input.customerId,
            payment_method: input.paymentMethodId,
            off_session: true,
            confirm: true,
            description: input.description,
          },
          { idempotencyKey: input.idempotencyKey },
        );

        if (intent.status === "succeeded" && intent.latest_charge) {
          return { outcome: "succeeded", chargeId: typeof intent.latest_charge === "string" ? intent.latest_charge : intent.latest_charge.id };
        }

        // e.g. the bank wants the cardholder there (3-D Secure).
        return { outcome: "requires_action" };
      } catch (error) {
        if (error instanceof Stripe.errors.StripeCardError) {
          if (error.code === "authentication_required") {
            return { outcome: "requires_action" };
          }
          return { outcome: "declined", reason: toDeclineReason(error.code, error.decline_code) };
        }
        throw error;
      }
    },

    async refund(input) {
      const refund = await stripe.refunds.create(
        { charge: input.chargeId, amount: input.amountCents },
        { idempotencyKey: input.idempotencyKey },
      );

      return { refundId: refund.id };
    },

    async ensureConnectedAccount(input) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: CONNECT_COUNTRY,
          capabilities: { transfers: { requested: true } },
          business_profile: { name: input.name },
          metadata: { userId: input.userId },
        },
        { idempotencyKey: `account:${input.userId}` },
      );

      return connectedAccountState(account);
    },

    async createOnboardingLink(input) {
      const link = await stripe.accountLinks.create({
        account: input.accountId,
        type: "account_onboarding",
        refresh_url: input.returnUrl,
        return_url: input.returnUrl,
      });

      return { url: link.url };
    },

    async getConnectedAccount(accountId) {
      return connectedAccountState(await stripe.accounts.retrieve(accountId));
    },

    async payout(input) {
      const transfer = await stripe.transfers.create(
        {
          amount: input.amountCents,
          currency: CURRENCY,
          destination: input.accountId,
          description: input.description,
        },
        { idempotencyKey: input.idempotencyKey },
      );

      return { transferId: transfer.id };
    },
  };
}
