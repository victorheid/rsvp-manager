import type { Db } from "@/server/db";
import { PaymentKind, PaymentStatus, PaymentRecordStatus } from "@/generated/prisma/enums";
import { refundableCents } from "@/server/domains/payments/rules";
import { creditRefund } from "@/server/domains/wallet";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * Gives money back on one game payment (§5, §7, §8): the price, and the
 * service fee too when `includeFee` (only for a cancelled confirmed event).
 * Wallet payments go back onto the balance; card payments back to the card.
 * Returns how many cents went back (0 if there was nothing left to refund).
 *
 * The provider call is keyed by the payment's refund state, so a retry
 * after a crash can't refund twice; the payment row only records a refund
 * that the provider accepted.
 */
export async function refundPayment(
  db: Db,
  gateway: PaymentGateway,
  input: { paymentId: string; includeFee: boolean },
): Promise<number> {
  const payment = await db.payment.findUniqueOrThrow({ where: { id: input.paymentId } });
  const { priceCents, feeCents } = refundableCents(payment, input.includeFee);
  const totalCents = priceCents + feeCents;

  if (totalCents === 0 || (payment.kind !== PaymentKind.GAME_CARD && payment.kind !== PaymentKind.GAME_WALLET)) {
    return 0;
  }

  if (payment.kind === PaymentKind.GAME_WALLET) {
    await db.$transaction(async (tx) => {
      await creditRefund(tx, { userId: payment.userId, paymentId: payment.id, amountCents: totalCents });
      await tx.payment.update({ where: { id: payment.id }, data: { refundedCents: { increment: priceCents } } });
    });
  } else {
    if (!payment.providerChargeId) {
      throw new Error(`Card payment ${payment.id} has no charge to refund`);
    }

    await gateway.refund({
      chargeId: payment.providerChargeId,
      amountCents: totalCents,
      idempotencyKey: `refund:${payment.id}:${payment.refundedCents}:${payment.feeRefundedCents}`,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: { refundedCents: { increment: priceCents }, feeRefundedCents: { increment: feeCents } },
    });
  }

  // A fully refunded price is a refunded RSVP, whatever happens to the fee.
  if (payment.rsvpId && payment.amountCents - payment.refundedCents - priceCents === 0) {
    await db.rsvp.updateMany({
      where: { id: payment.rsvpId, paymentStatus: PaymentStatus.CHARGED },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });
  }

  return totalCents;
}

/** Which payment rows a refund can apply to at all: successful game payments. */
export function refundablePaymentsWhere() {
  return { status: PaymentRecordStatus.SUCCEEDED, kind: { in: [PaymentKind.GAME_CARD, PaymentKind.GAME_WALLET] } };
}
