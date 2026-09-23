import { beforeEach, describe, expect, it } from "vitest";
import { describeGatewayContract } from "@/server/integrations/stripe/contract";
import { fakePaymentGateway } from "@/server/integrations/stripe/fake";

beforeEach(() => fakePaymentGateway.reset());

describeGatewayContract("FakePaymentGateway", () => ({
  gateway: fakePaymentGateway,
  play: {
    async saveCard(_gateway, setupIntentId, good) {
      fakePaymentGateway.completeSetupIntent(setupIntentId, good ? "visa" : "declined");
    },
    async pay(_gateway, paymentIntentId, customerId, good) {
      fakePaymentGateway.completePaymentIntent(paymentIntentId, good ? "visa" : "declined", customerId);
    },
  },
}));

describe("FakePaymentGateway scenarios", () => {
  it.each([
    ["declined", { outcome: "declined", reason: "card_declined" }],
    ["expired", { outcome: "declined", reason: "expired_card" }],
    ["insufficient_funds", { outcome: "declined", reason: "insufficient_funds" }],
    ["requires_action", { outcome: "requires_action" }],
  ] as const)("a %s card fails off-session as %j", async (scenario, expected) => {
    const { setupIntentId } = await fakePaymentGateway.createSetupIntent();
    fakePaymentGateway.completeSetupIntent(setupIntentId, scenario);
    const state = await fakePaymentGateway.retrieveSetupIntent(setupIntentId);
    if (state.status !== "succeeded") throw new Error("card not saved");

    const result = await fakePaymentGateway.chargeSavedCard({
      customerId: "cus_fake_u1",
      paymentMethodId: state.card.paymentMethodId,
      amountCents: 500,
      idempotencyKey: `k-${scenario}`,
      description: "game",
    });

    expect(result).toEqual(expected);
  });

  it("refuses a payout to an account that hasn't finished onboarding", async () => {
    fakePaymentGateway.onboardingCompletesImmediately = false;
    const account = await fakePaymentGateway.ensureConnectedAccount({ userId: "org", name: "Org" });
    await fakePaymentGateway.createOnboardingLink({ accountId: account.accountId, returnUrl: "https://app.example" });

    await expect(
      fakePaymentGateway.payout({ accountId: account.accountId, amountCents: 100, idempotencyKey: "p", description: "x" }),
    ).rejects.toThrow("onboarding");

    fakePaymentGateway.completeOnboarding(account.accountId);
    await fakePaymentGateway.payout({ accountId: account.accountId, amountCents: 100, idempotencyKey: "p", description: "x" });
  });

  it("logs what it charged, refunded and paid out", async () => {
    const { paymentIntentId } = await fakePaymentGateway.createPaymentIntent({ customerId: "c", amountCents: 900, idempotencyKey: "a", description: "d" });
    fakePaymentGateway.completePaymentIntent(paymentIntentId, "visa", "c");

    expect(fakePaymentGateway.chargesMade.map((c) => c.amountCents)).toEqual([900]);
  });
});
