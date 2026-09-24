import { fakePaymentGateway, FAKE_CARD_SCENARIOS } from "@/server/integrations/stripe/fake";
import { createStripeGateway } from "@/server/integrations/stripe/real";
import type { PaymentGateway } from "@/server/integrations/stripe/types";

export type * from "@/server/integrations/stripe/types";
export { FAKE_CARD_SCENARIOS };

let realGateway: { key: string; gateway: PaymentGateway } | null = null;

/**
 * Picks the payment adapter for the current process: the fake under tests;
 * real Stripe whenever `STRIPE_SECRET_KEY` is set (test-mode keys give
 * sandbox payments); otherwise the in-memory fake — refused in production,
 * since taking "payments" that never reach a bank must fail loudly.
 */
export function getPaymentGateway(): PaymentGateway {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!process.env.VITEST && key) {
    if (realGateway?.key !== key) {
      realGateway = { key, gateway: createStripeGateway(key) };
    }
    return realGateway.gateway;
  }

  if (process.env.NODE_ENV === "production" && !process.env.VITEST) {
    throw new Error("No payment gateway configured: set STRIPE_SECRET_KEY (refusing to run the fake in production).");
  }

  return fakePaymentGateway;
}

/** The fake gateway when that's what's running — the dev card form needs it to play the browser. */
export function getFakePaymentGateway() {
  return getPaymentGateway() === fakePaymentGateway ? fakePaymentGateway : null;
}
