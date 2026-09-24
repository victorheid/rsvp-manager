import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeGateway } from "@/server/integrations/stripe/real";

// Offline: signs payloads the way Stripe does, so no network or real keys are needed.
const stripe = new Stripe("sk_test_unused");
const secret = "whsec_test_secret";
const gateway = createStripeGateway("sk_test_unused", secret);

function signed(payload: object, signingSecret = secret) {
  const rawBody = JSON.stringify(payload);
  return { rawBody, signature: stripe.webhooks.generateTestHeaderString({ payload: rawBody, secret: signingSecret }) };
}

describe("Stripe webhook parsing", () => {
  it.each(["payment_intent.succeeded", "payment_intent.payment_failed"])("turns %s into a payment update", (type) => {
    const { rawBody, signature } = signed({ id: "evt_1", object: "event", type, data: { object: { id: "pi_123", object: "payment_intent" } } });

    expect(gateway.parseWebhook(rawBody, signature)).toEqual({ type: "payment_updated", paymentIntentId: "pi_123" });
  });

  it("turns account.updated into an account update", () => {
    const { rawBody, signature } = signed({ id: "evt_2", object: "event", type: "account.updated", data: { object: { id: "acct_123", object: "account" } } });

    expect(gateway.parseWebhook(rawBody, signature)).toEqual({ type: "account_updated", accountId: "acct_123" });
  });

  it("ignores event types it doesn't act on", () => {
    const { rawBody, signature } = signed({ id: "evt_3", object: "event", type: "customer.created", data: { object: { id: "cus_1", object: "customer" } } });

    expect(gateway.parseWebhook(rawBody, signature)).toBeNull();
  });

  it("rejects a payload signed with the wrong secret, an altered body, and a missing signature", () => {
    const event = { id: "evt_4", object: "event", type: "payment_intent.succeeded", data: { object: { id: "pi_123", object: "payment_intent" } } };
    const forged = signed(event, "whsec_someone_else");
    const genuine = signed(event);

    expect(() => gateway.parseWebhook(forged.rawBody, forged.signature)).toThrow();
    expect(() => gateway.parseWebhook(genuine.rawBody.replace("pi_123", "pi_999"), genuine.signature)).toThrow();
    expect(() => gateway.parseWebhook(genuine.rawBody, null)).toThrow("signed");
  });

  it("refuses everything when no webhook secret is configured", () => {
    const { rawBody, signature } = signed({ id: "evt_5", object: "event", type: "payment_intent.succeeded", data: { object: { id: "pi_1", object: "payment_intent" } } });

    expect(() => createStripeGateway("sk_test_unused").parseWebhook(rawBody, signature)).toThrow("aren't configured");
  });
});
