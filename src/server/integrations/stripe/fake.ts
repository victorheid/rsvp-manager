import type {
  ConnectedAccountState,
  DeclineReason,
  OffSessionChargeResult,
  PaymentGateway,
  PaymentIntent,
  PaymentIntentState,
  SavedCard,
  SetupIntent,
  SetupIntentState,
} from "@/server/integrations/stripe/types";

/**
 * What the pretend cardholder does. Picked when the fake "browser" completes
 * a SetupIntent or PaymentIntent (see `completeSetupIntent`), and baked into
 * the saved card's id (`pm_fake_<scenario>_<n>`) so later off-session
 * charges behave the same way in any process.
 */
export const FAKE_CARD_SCENARIOS = ["visa", "declined", "expired", "insufficient_funds", "requires_action"] as const;
export type FakeCardScenario = (typeof FAKE_CARD_SCENARIOS)[number];

const DECLINES: Record<"declined" | "expired" | "insufficient_funds", DeclineReason> = {
  declined: "card_declined",
  expired: "expired_card",
  insufficient_funds: "insufficient_funds",
};

function scenarioOf(paymentMethodId: string): FakeCardScenario {
  return FAKE_CARD_SCENARIOS.find((scenario) => paymentMethodId.startsWith(`pm_fake_${scenario}_`)) ?? "visa";
}

interface FakeCharge {
  amountCents: number;
  refundedCents: number;
}

/** Runs `create` once per key; repeats return the first result, like Stripe's idempotency keys. */
function once<T>(cache: Map<string, T>, key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const result = create();
  cache.set(key, result);
  return result;
}

/**
 * In-memory stand-in for Stripe: stateful enough that domain code and its
 * tests behave as they would against the real thing, without keys or a
 * network. Used by feature tests, and in local dev until real keys exist.
 *
 * Money-moving calls are idempotent by key, like Stripe's. State lives in
 * the current process only; ids that matter across processes (customers,
 * accounts, cards) are derived from their inputs, and a refund of a charge
 * this process never saw is accepted, so the web process and the worker
 * can share a dev database.
 *
 * Tests inspect `chargesMade`, `refundsMade` and `payoutsMade`, and play
 * the browser with `completeSetupIntent` / `completePaymentIntent`.
 */
class FakePaymentGateway implements PaymentGateway {
  private counter = 0;
  private setupIntents = new Map<string, SetupIntentState>();
  private paymentIntents = new Map<string, { amountCents: number; state: PaymentIntentState }>();
  private charges = new Map<string, FakeCharge>();
  private accounts = new Map<string, ConnectedAccountState>();
  private createdIntents = new Map<string, PaymentIntent>();
  private chargeResults = new Map<string, OffSessionChargeResult>();
  private refundResults = new Map<string, { refundId: string }>();
  private payoutResults = new Map<string, { transferId: string }>();

  /** When true, requesting an onboarding link finishes onboarding instantly. Tests set it false. */
  onboardingCompletesImmediately = true;

  chargesMade: { chargeId: string; customerId: string; amountCents: number; description: string }[] = [];
  refundsMade: { refundId: string; chargeId: string; amountCents: number }[] = [];
  payoutsMade: { transferId: string; accountId: string; amountCents: number }[] = [];

  reset() {
    this.counter = 0;
    this.setupIntents = new Map();
    this.paymentIntents = new Map();
    this.charges = new Map();
    this.accounts = new Map();
    this.createdIntents = new Map();
    this.chargeResults = new Map();
    this.refundResults = new Map();
    this.payoutResults = new Map();
    this.onboardingCompletesImmediately = true;
    this.chargesMade = [];
    this.refundsMade = [];
    this.payoutsMade = [];
  }

  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}_fake_${this.counter}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private card(scenario: FakeCardScenario): SavedCard {
    return { paymentMethodId: `pm_fake_${scenario}_${this.nextId("n")}`, brand: "visa", last4: "4242" };
  }

  private recordCharge(customerId: string, amountCents: number, description: string) {
    const chargeId = this.nextId("ch");
    this.charges.set(chargeId, { amountCents, refundedCents: 0 });
    this.chargesMade.push({ chargeId, customerId, amountCents, description });
    return chargeId;
  }

  async ensureCustomer(input: { userId: string; name: string }) {
    return { customerId: `cus_fake_${input.userId}` };
  }

  async createSetupIntent(): Promise<SetupIntent> {
    const setupIntentId = this.nextId("seti");
    this.setupIntents.set(setupIntentId, { status: "pending" });
    return { setupIntentId, clientSecret: `${setupIntentId}_secret` };
  }

  /** The id a client secret was made from (`<id>_secret`), for the dev card form that only has the secret. */
  intentIdFromClientSecret(clientSecret: string) {
    return clientSecret.replace(/_secret$/, "");
  }

  /** Plays the browser: the cardholder enters a card that behaves as `scenario`. */
  completeSetupIntent(setupIntentId: string, scenario: FakeCardScenario) {
    this.setupIntents.set(setupIntentId, { status: "succeeded", card: this.card(scenario) });
  }

  async retrieveSetupIntent(setupIntentId: string): Promise<SetupIntentState> {
    return this.setupIntents.get(setupIntentId) ?? { status: "pending" };
  }

  async createPaymentIntent(input: {
    customerId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<PaymentIntent> {
    return once(this.createdIntents, input.idempotencyKey, () => {
      const paymentIntentId = this.nextId("pi");
      this.paymentIntents.set(paymentIntentId, { amountCents: input.amountCents, state: { status: "pending" } });
      return { paymentIntentId, clientSecret: `${paymentIntentId}_secret` };
    });
  }

  /**
   * Plays the browser paying: a good card succeeds (`requires_action` means
   * 3-D Secure, which the cardholder passes); the others fail.
   */
  completePaymentIntent(paymentIntentId: string, scenario: FakeCardScenario, customerId = "cus_fake_unknown") {
    const intent = this.paymentIntents.get(paymentIntentId);
    if (!intent || intent.state.status !== "pending") {
      throw new Error(`No pending payment intent ${paymentIntentId}`);
    }

    if (scenario === "visa" || scenario === "requires_action") {
      const chargeId = this.recordCharge(customerId, intent.amountCents, `payment intent ${paymentIntentId}`);
      intent.state = { status: "succeeded", chargeId, card: this.card(scenario) };
    } else {
      intent.state = { status: "failed", reason: DECLINES[scenario] };
    }
  }

  async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentState> {
    return this.paymentIntents.get(paymentIntentId)?.state ?? { status: "pending" };
  }

  async chargeSavedCard(input: {
    customerId: string;
    paymentMethodId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<OffSessionChargeResult> {
    return once(this.chargeResults, input.idempotencyKey, (): OffSessionChargeResult => {
      const scenario = scenarioOf(input.paymentMethodId);

      if (scenario === "requires_action") {
        return { outcome: "requires_action" };
      }
      if (scenario !== "visa") {
        return { outcome: "declined", reason: DECLINES[scenario] };
      }

      return { outcome: "succeeded", chargeId: this.recordCharge(input.customerId, input.amountCents, input.description) };
    });
  }

  async refund(input: { chargeId: string; amountCents: number; idempotencyKey: string }) {
    return once(this.refundResults, input.idempotencyKey, () => {
      const charge = this.charges.get(input.chargeId);

      if (charge) {
        if (charge.refundedCents + input.amountCents > charge.amountCents) {
          throw new Error(`Refund of ${input.amountCents} exceeds what's left of charge ${input.chargeId}`);
        }
        charge.refundedCents += input.amountCents;
      }

      const refundId = this.nextId("re");
      this.refundsMade.push({ refundId, chargeId: input.chargeId, amountCents: input.amountCents });
      return { refundId };
    });
  }

  async ensureConnectedAccount(input: { userId: string; name: string }): Promise<ConnectedAccountState> {
    const accountId = `acct_fake_${input.userId}`;
    const existing = this.accounts.get(accountId);
    if (existing) return existing;

    const created = { accountId, payoutsEnabled: false };
    this.accounts.set(accountId, created);
    return created;
  }

  async createOnboardingLink(input: { accountId: string; returnUrl: string }) {
    if (this.onboardingCompletesImmediately) {
      this.completeOnboarding(input.accountId);
    }
    return { url: input.returnUrl };
  }

  /** Plays the organizer finishing Stripe's ID + bank-details form. */
  completeOnboarding(accountId: string) {
    this.accounts.set(accountId, { accountId, payoutsEnabled: true });
  }

  async getConnectedAccount(accountId: string): Promise<ConnectedAccountState> {
    return this.accounts.get(accountId) ?? { accountId, payoutsEnabled: false };
  }

  async payout(input: { accountId: string; amountCents: number; idempotencyKey: string; description: string }) {
    return once(this.payoutResults, input.idempotencyKey, () => {
      const account = this.accounts.get(input.accountId);
      if (account && !account.payoutsEnabled) {
        throw new Error(`Account ${input.accountId} hasn't finished onboarding`);
      }

      const transferId = this.nextId("tr");
      this.payoutsMade.push({ transferId, accountId: input.accountId, amountCents: input.amountCents });
      return { transferId };
    });
  }
}

export const fakePaymentGateway = new FakePaymentGateway();
export type { FakePaymentGateway };
