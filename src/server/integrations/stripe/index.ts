import { fakePaymentGateway } from "@/server/integrations/stripe/fake";
import type { PaymentGateway } from "@/server/integrations/stripe/types";

export type * from "@/server/integrations/stripe/types";

/**
 * Picks the payment adapter for the current process. Until the real Stripe
 * adapter exists (specs/tasks.md §0) everything runs on the in-memory fake,
 * which is fine for tests and local dev and refused in production: taking
 * "payments" that never reach a bank must fail loudly.
 */
export function getPaymentGateway(): PaymentGateway {
  if (process.env.NODE_ENV === "production" && !process.env.VITEST) {
    throw new Error("No real payment gateway is wired up yet — refusing to run the fake in production.");
  }

  return fakePaymentGateway;
}
