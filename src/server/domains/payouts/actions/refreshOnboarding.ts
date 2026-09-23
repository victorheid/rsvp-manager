import type { Db } from "@/server/db";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * Asks the provider whether the organizer finished onboarding and
 * remembers the answer (§5): run when they come back from the provider's
 * page, and again before payouts.
 */
export async function refreshOnboarding(db: Db, gateway: PaymentGateway, input: { userId: string }) {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });

  if (!user.stripeAccountId) {
    return { payoutsEnabled: false };
  }

  const account = await gateway.getConnectedAccount(user.stripeAccountId);

  if (account.payoutsEnabled !== user.payoutsEnabled) {
    await db.user.update({ where: { id: user.id }, data: { payoutsEnabled: account.payoutsEnabled } });
  }

  return { payoutsEnabled: account.payoutsEnabled };
}
