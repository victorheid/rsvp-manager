import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentKind, PaymentRecordStatus } from "@/generated/prisma/enums";
import { feeRules, getCurrentFeeSchedule } from "@/server/domains/fees";
import { getOrCreateCustomerId } from "@/server/domains/wallet/actions/getOrCreateCustomerId";
import { topUpBlockedReason } from "@/server/domains/wallet/rules";
import type { PaymentGateway } from "@/server/integrations/stripe";

export interface StartTopUpInput {
  userId: string;
  amountCents: number;
}

const BLOCKED_MESSAGES = {
  INVALID_AMOUNT: "Choose €20, €50 or €100.",
  WOULD_EXCEED_MAX: "Would exceed the €150 max balance.",
} as const;

/**
 * Starts a wallet top-up (§5): records a pending payment of the amount plus
 * the stepped top-up fee (on the schedule in force now), and asks the
 * provider for a payment intent the browser will confirm. Nothing is
 * credited until `completeTopUp` sees the payment succeed.
 */
export async function startTopUp(db: Db, gateway: PaymentGateway, input: StartTopUpInput, now: Date) {
  const wallet = await db.wallet.findUnique({ where: { userId: input.userId } });
  const blocked = topUpBlockedReason(wallet?.balanceCents ?? 0, input.amountCents);

  if (blocked) {
    throw new TRPCError({ code: "BAD_REQUEST", message: BLOCKED_MESSAGES[blocked] });
  }

  const schedule = await getCurrentFeeSchedule(db, now);
  const feeCents = feeRules.feeForAmountCents(schedule.topUpFeeTiers, input.amountCents);
  const payment = await db.payment.create({
    data: {
      userId: input.userId,
      kind: PaymentKind.TOP_UP,
      status: PaymentRecordStatus.PENDING,
      amountCents: input.amountCents,
      feeCents,
      feeScheduleId: schedule.id,
    },
  });

  try {
    const customerId = await getOrCreateCustomerId(db, gateway, input.userId);
    const intent = await gateway.createPaymentIntent({
      customerId,
      amountCents: input.amountCents + feeCents,
      idempotencyKey: `top-up:${payment.id}`,
      description: `Wallet top-up ${payment.id}`,
    });
    await db.payment.update({ where: { id: payment.id }, data: { providerIntentId: intent.paymentIntentId } });

    return {
      paymentId: payment.id,
      clientSecret: intent.clientSecret,
      creditCents: input.amountCents,
      feeCents,
      totalCents: input.amountCents + feeCents,
    };
  } catch (error) {
    await db.payment.update({ where: { id: payment.id }, data: { status: PaymentRecordStatus.FAILED } });
    throw error;
  }
}
