import type { Db } from "@/server/db";
import { completeOwedPaymentByIntent } from "@/server/domains/payments";
import { refreshOnboardingByAccount } from "@/server/domains/payouts";
import { completeTopUpByIntent } from "@/server/domains/wallet";
import type { GatewayEvent, PaymentGateway } from "@/server/integrations/stripe";

/**
 * Acts on a verified provider webhook. It only ever means "go and look":
 * each handler re-asks the provider and updates our records idempotently,
 * so an event arriving twice, late, or racing the browser's own return
 * does no harm. This is what settles a payment when the player closed the
 * tab right after paying. Events for things that aren't ours are ignored.
 */
export async function handleGatewayEvent(db: Db, gateway: PaymentGateway, event: GatewayEvent) {
  switch (event.type) {
    case "payment_updated":
      // A payment is either a wallet top-up or someone paying what they owe.
      if ((await completeTopUpByIntent(db, gateway, event)) === null) {
        await completeOwedPaymentByIntent(db, gateway, event);
      }
      return;
    case "account_updated":
      await refreshOnboardingByAccount(db, gateway, event);
      return;
  }
}
