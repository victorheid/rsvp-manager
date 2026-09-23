import { describe, expect, it } from "vitest";
import type { PaymentGateway } from "@/server/integrations/stripe/types";

/**
 * Behaviour every `PaymentGateway` must have, whether it's the in-memory
 * fake or the real Stripe adapter running in test mode. The rest of the
 * app is tested against the fake, so this is what keeps the fake honest:
 * when the real adapter exists, run the same suite against it.
 *
 * `play` is how a test performs the parts a real cardholder would do in the
 * browser (entering a card, finishing onboarding); each implementation
 * provides its own.
 */
export interface GatewayPlayer {
  saveCard(gateway: PaymentGateway, setupIntentId: string, good: boolean): Promise<void>;
  pay(gateway: PaymentGateway, paymentIntentId: string, customerId: string, good: boolean): Promise<void>;
}

export function describeGatewayContract(
  name: string,
  create: () => { gateway: PaymentGateway; play: GatewayPlayer },
) {
  describe(`${name} satisfies the PaymentGateway contract`, () => {
    it("gives the same customer back for the same user", async () => {
      const { gateway } = create();
      const first = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const second = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });

      expect(second.customerId).toBe(first.customerId);
    });

    it("reports a setup intent as pending until the card is entered, then returns the card", async () => {
      const { gateway, play } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const { setupIntentId } = await gateway.createSetupIntent({ customerId });

      expect(await gateway.retrieveSetupIntent(setupIntentId)).toEqual({ status: "pending" });

      await play.saveCard(gateway, setupIntentId, true);
      const state = await gateway.retrieveSetupIntent(setupIntentId);
      expect(state.status).toBe("succeeded");
    });

    it("charges a good saved card once per idempotency key", async () => {
      const { gateway, play } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const { setupIntentId } = await gateway.createSetupIntent({ customerId });
      await play.saveCard(gateway, setupIntentId, true);
      const state = await gateway.retrieveSetupIntent(setupIntentId);
      if (state.status !== "succeeded") throw new Error("card not saved");

      const charge = { customerId, paymentMethodId: state.card.paymentMethodId, amountCents: 850, idempotencyKey: "k1", description: "game" };
      const first = await gateway.chargeSavedCard(charge);
      const again = await gateway.chargeSavedCard(charge);

      expect(first.outcome).toBe("succeeded");
      expect(again).toEqual(first);
    });

    it("reports a bad saved card as declined or needing action, not as an error", async () => {
      const { gateway, play } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const { setupIntentId } = await gateway.createSetupIntent({ customerId });
      await play.saveCard(gateway, setupIntentId, false);
      const state = await gateway.retrieveSetupIntent(setupIntentId);
      if (state.status !== "succeeded") throw new Error("card not saved");

      const result = await gateway.chargeSavedCard({
        customerId,
        paymentMethodId: state.card.paymentMethodId,
        amountCents: 850,
        idempotencyKey: "k2",
        description: "game",
      });

      expect(["declined", "requires_action"]).toContain(result.outcome);
    });

    it("completes a payment intent and returns the charge", async () => {
      const { gateway, play } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const { paymentIntentId } = await gateway.createPaymentIntent({
        customerId,
        amountCents: 2100,
        idempotencyKey: "topup-1",
        description: "top-up",
      });

      expect(await gateway.retrievePaymentIntent(paymentIntentId)).toEqual({ status: "pending" });

      await play.pay(gateway, paymentIntentId, customerId, true);
      expect((await gateway.retrievePaymentIntent(paymentIntentId)).status).toBe("succeeded");
    });

    it("creates one payment intent per idempotency key", async () => {
      const { gateway } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const input = { customerId, amountCents: 2100, idempotencyKey: "topup-1", description: "top-up" };

      const first = await gateway.createPaymentIntent(input);
      const again = await gateway.createPaymentIntent(input);

      expect(again.paymentIntentId).toBe(first.paymentIntentId);
    });

    it("refunds a charge partly, but never more than was charged", async () => {
      const { gateway, play } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const { paymentIntentId } = await gateway.createPaymentIntent({
        customerId,
        amountCents: 1000,
        idempotencyKey: "pay-1",
        description: "game",
      });
      await play.pay(gateway, paymentIntentId, customerId, true);
      const state = await gateway.retrievePaymentIntent(paymentIntentId);
      if (state.status !== "succeeded") throw new Error("payment failed");

      await gateway.refund({ chargeId: state.chargeId, amountCents: 600, idempotencyKey: "r1" });
      await expect(gateway.refund({ chargeId: state.chargeId, amountCents: 500, idempotencyKey: "r2" })).rejects.toThrow();
      await gateway.refund({ chargeId: state.chargeId, amountCents: 400, idempotencyKey: "r3" });
    });

    it("refunds once per idempotency key", async () => {
      const { gateway, play } = create();
      const { customerId } = await gateway.ensureCustomer({ userId: "u1", name: "Ann B" });
      const { paymentIntentId } = await gateway.createPaymentIntent({
        customerId,
        amountCents: 1000,
        idempotencyKey: "pay-1",
        description: "game",
      });
      await play.pay(gateway, paymentIntentId, customerId, true);
      const state = await gateway.retrievePaymentIntent(paymentIntentId);
      if (state.status !== "succeeded") throw new Error("payment failed");

      const first = await gateway.refund({ chargeId: state.chargeId, amountCents: 1000, idempotencyKey: "r1" });
      const again = await gateway.refund({ chargeId: state.chargeId, amountCents: 1000, idempotencyKey: "r1" });

      expect(again).toEqual(first);
    });

    it("pays out once per idempotency key to an onboarded account", async () => {
      const { gateway } = create();
      const account = await gateway.ensureConnectedAccount({ userId: "org", name: "Org O" });
      const link = await gateway.createOnboardingLink({ accountId: account.accountId, returnUrl: "https://app.example/back" });
      expect(link.url).toContain("https://");

      const payout = { accountId: account.accountId, amountCents: 4000, idempotencyKey: "p1", description: "event" };
      const first = await gateway.payout(payout);
      const again = await gateway.payout(payout);

      expect(again).toEqual(first);
    });
  });
}
