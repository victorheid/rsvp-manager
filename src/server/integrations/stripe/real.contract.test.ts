import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { describe, vi } from "vitest";
import { describeGatewayContract } from "@/server/integrations/stripe/contract";
import { createStripeGateway } from "@/server/integrations/stripe/real";

/**
 * The same contract the fake passes, run against Stripe's sandbox. Opt-in
 * (it makes real API calls): `pnpm test:stripe`. Test-mode keys only.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;
const enabled = process.env.STRIPE_CONTRACT === "1" && secretKey?.startsWith("sk_test_");

describe.skipIf(!enabled)("StripeGateway (sandbox)", () => {
  // Real network calls: several per test.
  vi.setConfig({ testTimeout: 60_000 });

  // The describe body runs even when skipped, so give the client a placeholder key it never uses.
  const stripe = new Stripe(secretKey ?? "sk_test_unused");

  // Fresh user ids per run: Stripe replays idempotent calls made within 24 hours.
  const run = randomUUID().slice(0, 8);

  describeGatewayContract(
    "StripeGateway",
    () => ({
      gateway: createStripeGateway(secretKey ?? "sk_test_unused"),
      play: {
        // Test payment-method tokens stand in for the card a person would type into Stripe Elements.
        async saveCard(_gateway, setupIntentId, good) {
          await stripe.setupIntents.confirm(setupIntentId, {
            payment_method: good ? "pm_card_visa" : "pm_card_chargeCustomerFail",
          });
        },
        async pay(_gateway, paymentIntentId, _customerId, good) {
          try {
            await stripe.paymentIntents.confirm(paymentIntentId, {
              payment_method: good ? "pm_card_visa" : "pm_card_chargeDeclined",
            });
          } catch (error) {
            if (good) throw error;
          }
        },
      },
    }),
    { canPayOut: false },
  );

  void run;
});
