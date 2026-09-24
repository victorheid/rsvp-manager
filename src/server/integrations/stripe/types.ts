/**
 * What the app needs from a payment provider — shaped by our use cases, not
 * by Stripe's API surface. Domains depend on this and never import the
 * Stripe SDK (CLAUDE.md → "Integrations"). All amounts are integer cents,
 * EUR only.
 *
 * Every call that moves money takes an `idempotencyKey`; calling again with
 * the same key returns the first result instead of charging twice. Callers
 * derive keys from their own records (e.g. `rsvp:<id>:confirm`).
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "unknown";

export interface SavedCard {
  paymentMethodId: string;
  brand: CardBrand;
  last4: string;
}

export interface SetupIntent {
  setupIntentId: string;
  /** Handed to Stripe.js in the browser, which collects and confirms the card. */
  clientSecret: string;
}

export type SetupIntentState =
  | { status: "pending" }
  | { status: "succeeded"; card: SavedCard }
  | { status: "failed" };

export interface PaymentIntent {
  paymentIntentId: string;
  clientSecret: string;
}

export type PaymentIntentState =
  | { status: "pending" }
  | { status: "succeeded"; chargeId: string; card: SavedCard }
  | { status: "failed"; reason: DeclineReason };

export type DeclineReason = "card_declined" | "expired_card" | "insufficient_funds";

/** Result of charging a saved card with nobody present (§5 "Failed card charge"). */
export type OffSessionChargeResult =
  | { outcome: "succeeded"; chargeId: string }
  | { outcome: "declined"; reason: DeclineReason }
  // The bank wants the cardholder there (3-D Secure): same handling as a decline — "owes" + pay link.
  | { outcome: "requires_action" };

export interface ConnectedAccountState {
  accountId: string;
  /** Onboarding finished (ID + bank details) and Stripe will accept payouts to it. */
  payoutsEnabled: boolean;
}

/**
 * What a provider webhook tells us, reduced to "go and look": we never trust
 * the payload's contents, only that *something changed* for this object, and
 * then ask the provider (and update our records idempotently).
 */
export type GatewayEvent =
  | { type: "payment_updated"; paymentIntentId: string }
  | { type: "account_updated"; accountId: string };

/**
 * What we already know about an organizer, prefilled on their connected
 * account so Stripe's onboarding doesn't ask for it again.
 */
export interface ConnectedAccountInput {
  userId: string;
  name: string;
  email: string | null;
  /** E.164, as stored on the user. */
  phoneNumber: string;
}

export interface PaymentGateway {
  /**
   * Checks a webhook's signature and turns it into a `GatewayEvent`, or null
   * for event types we don't act on. Throws when the signature is wrong —
   * anyone can POST to the endpoint, so nothing unsigned is believed.
   */
  parseWebhook(rawBody: string, signature: string | null): GatewayEvent | null;

  /** One customer per user; the same `userId` always maps to the same customer. */
  ensureCustomer(input: { userId: string; name: string }): Promise<{ customerId: string }>;

  /** §5 card RSVP: save a card now, charge it later. */
  createSetupIntent(input: { customerId: string }): Promise<SetupIntent>;
  retrieveSetupIntent(setupIntentId: string): Promise<SetupIntentState>;

  /** A payment the user makes on the spot: wallet top-up, or a pay link for what they owe. */
  createPaymentIntent(input: {
    customerId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<PaymentIntent>;
  retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentState>;

  /** Charges a saved card off-session, at confirmation or when joining a confirmed event. */
  chargeSavedCard(input: {
    customerId: string;
    paymentMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<OffSessionChargeResult>;

  /** Refunds part or all of a charge. Throws if it would refund more than was charged. */
  refund(input: { chargeId: string; amountCents: number; idempotencyKey: string }): Promise<{ refundId: string }>;

  /** §5 organizer payouts: Stripe Connect. */
  ensureConnectedAccount(input: ConnectedAccountInput): Promise<ConnectedAccountState>;
  createOnboardingLink(input: { accountId: string; returnUrl: string }): Promise<{ url: string }>;
  getConnectedAccount(accountId: string): Promise<ConnectedAccountState>;
  /** Moves money from the platform to an organizer's connected account. */
  payout(input: {
    accountId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<{ transferId: string }>;
}
