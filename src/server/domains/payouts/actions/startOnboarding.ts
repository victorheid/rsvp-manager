import type { Db } from "@/server/db";
import type { PaymentGateway } from "@/server/integrations/stripe";

export interface StartOnboardingInput {
  userId: string;
  /** Absolute address Stripe sends the organizer back to. */
  returnUrl: string;
}

/**
 * Starts (or resumes) an organizer's payout onboarding (§5): makes sure
 * they have a connected account and returns the provider's page for
 * entering ID and bank details. Cash-only organizers never need this.
 * Calls the provider, so no transaction around it.
 */
export async function startOnboarding(db: Db, gateway: PaymentGateway, input: StartOnboardingInput) {
  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });
  const account = await gateway.ensureConnectedAccount({ userId: user.id, name: `${user.firstName} ${user.lastInitial}` });

  if (user.stripeAccountId !== account.accountId) {
    await db.user.update({ where: { id: user.id }, data: { stripeAccountId: account.accountId } });
  }

  return gateway.createOnboardingLink({ accountId: account.accountId, returnUrl: input.returnUrl });
}
