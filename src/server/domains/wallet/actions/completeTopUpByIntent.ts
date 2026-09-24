import type { Db } from "@/server/db";
import { PaymentKind } from "@/generated/prisma/enums";
import { completeTopUp, type CompleteTopUpResult } from "@/server/domains/wallet/actions/completeTopUp";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * Webhook entry to `completeTopUp`: finds the top-up a provider payment
 * belongs to. Returns null if the payment isn't a top-up of ours.
 */
export async function completeTopUpByIntent(
  db: Db,
  gateway: PaymentGateway,
  input: { paymentIntentId: string },
): Promise<CompleteTopUpResult | null> {
  const payment = await db.payment.findFirst({
    where: { providerIntentId: input.paymentIntentId, kind: PaymentKind.TOP_UP },
  });

  return payment ? completeTopUp(db, gateway, { userId: payment.userId, paymentId: payment.id }) : null;
}
