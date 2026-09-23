import type { EventModel, PaymentModel } from "@/generated/prisma/models";

/**
 * Business rules for game payments (spec §5, §8). Pure functions only: no
 * Prisma calls, no Date.now(), no I/O. Money is integer cents, EUR only.
 */

/** §5: the organizer's payout is released this long after the event ends. */
export const PAYOUT_DELAY_MS = 2 * 24 * 60 * 60 * 1000;

export function payoutDueAt(event: Pick<EventModel, "endsAt">): Date {
  return new Date(event.endsAt.getTime() + PAYOUT_DELAY_MS);
}

/** §5: a confirmed event whose payout time has come and that hasn't been paid out yet. */
export function isPayoutDue(event: Pick<EventModel, "status" | "endsAt">, alreadyPaidOut: boolean, now: Date): boolean {
  return event.status === "CONFIRMED" && !alreadyPaidOut && now >= payoutDueAt(event);
}

/** §5: "In-app refunds are available until payout." */
export function canRefundOnline(event: Pick<EventModel, "endsAt">, now: Date): boolean {
  return now < payoutDueAt(event);
}

type RefundablePayment = Pick<PaymentModel, "status" | "amountCents" | "feeCents" | "refundedCents" | "feeRefundedCents">;

/**
 * What can still be given back on a payment (§5, §8): the price left, and —
 * only when the organizer cancels a confirmed event — the fee left too.
 */
export function refundableCents(payment: RefundablePayment, includeFee: boolean): { priceCents: number; feeCents: number } {
  if (payment.status !== "SUCCEEDED") {
    return { priceCents: 0, feeCents: 0 };
  }

  return {
    priceCents: payment.amountCents - payment.refundedCents,
    feeCents: includeFee ? payment.feeCents - payment.feeRefundedCents : 0,
  };
}

/** What a failed card payment still owes: price plus the fee as originally charged (§5: fees are never recalculated). */
export function owedCents(payment: Pick<PaymentModel, "amountCents" | "feeCents">): number {
  return payment.amountCents + payment.feeCents;
}

/** What the organizer is paid for an event: the price of every successful game payment, less price refunds (§5). */
export function payoutAmountCents(
  payments: readonly Pick<PaymentModel, "kind" | "status" | "amountCents" | "refundedCents">[],
): number {
  return payments
    .filter((payment) => payment.status === "SUCCEEDED" && (payment.kind === "GAME_CARD" || payment.kind === "GAME_WALLET"))
    .reduce((sum, payment) => sum + payment.amountCents - payment.refundedCents, 0);
}
