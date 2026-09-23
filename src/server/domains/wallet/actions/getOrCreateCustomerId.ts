import type { Db } from "@/server/db";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * The payment provider's customer for a user, created on first need and
 * remembered. Calls the provider, so run it outside any transaction.
 */
export async function getOrCreateCustomerId(db: Db, gateway: PaymentGateway, userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const { customerId } = await gateway.ensureCustomer({ userId, name: `${user.firstName} ${user.lastInitial}` });
  await db.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });

  return customerId;
}
