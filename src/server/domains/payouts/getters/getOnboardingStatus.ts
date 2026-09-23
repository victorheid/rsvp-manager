import type { Db } from "@/server/db";

/** Whether this organizer can take online payments (§5): started onboarding, and finished it. */
export async function getOnboardingStatus(db: Db, userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  return { started: user.stripeAccountId !== null, payoutsEnabled: user.payoutsEnabled };
}
