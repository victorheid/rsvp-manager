import type { Db } from "@/server/db";
import { TRPCError } from "@trpc/server";
import { authRules } from "@/server/domains/auth";
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
  const emailProblem = authRules.organizerEmailProblem(user);

  if (emailProblem) {
    throw new TRPCError({ code: "FORBIDDEN", message: emailProblem });
  }

  let accountId = user.stripeAccountId;

  if (!accountId) {
    // Created once and remembered: a second account for the same organizer would strand their onboarding.
    const account = await gateway.ensureConnectedAccount({ userId: user.id, name: `${user.firstName} ${user.lastInitial}` });
    accountId = account.accountId;
    await db.user.update({ where: { id: user.id }, data: { stripeAccountId: accountId } });
  }

  return gateway.createOnboardingLink({ accountId, returnUrl: input.returnUrl });
}
