import type { Db } from "@/server/db";
import { refreshOnboarding } from "@/server/domains/payouts/actions/refreshOnboarding";
import type { PaymentGateway } from "@/server/integrations/stripe";

/** Webhook entry to `refreshOnboarding`: the provider says an organizer's account changed. Null if it isn't one of ours. */
export async function refreshOnboardingByAccount(db: Db, gateway: PaymentGateway, input: { accountId: string }) {
  const user = await db.user.findUnique({ where: { stripeAccountId: input.accountId } });

  return user ? refreshOnboarding(db, gateway, { userId: user.id }) : null;
}
