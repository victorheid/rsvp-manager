import { db } from "@/server/db";
import { handleGatewayEvent } from "@/server/domains/webhooks";
import { getPaymentGateway } from "@/server/integrations/stripe";

/**
 * Stripe posts here when a payment or connected account changes (§5). The
 * body is read raw — the signature is over the exact bytes — and checked
 * before anything happens. Bad signature → 400 (never retried); a failure
 * while handling → 500, so Stripe retries later.
 */
export async function POST(request: Request) {
  const gateway = getPaymentGateway();
  const rawBody = await request.text();

  let event;
  try {
    event = gateway.parseWebhook(rawBody, request.headers.get("stripe-signature"));
  } catch (error) {
    console.warn("[webhook] rejected", error instanceof Error ? error.message : error);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event) {
    try {
      await handleGatewayEvent(db, gateway, event);
    } catch (error) {
      console.error("[webhook] handling failed", error);
      return new Response("Handler failed", { status: 500 });
    }
  }

  return new Response("ok", { status: 200 });
}
