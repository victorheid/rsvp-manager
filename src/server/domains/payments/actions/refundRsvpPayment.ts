import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { canRefundOnline } from "@/server/domains/payments/rules";
import { notifyRefund } from "@/server/domains/payments/actions/refundEventPayments";
import { refundPayment, refundablePaymentsWhere } from "@/server/domains/payments/actions/refundPayment";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * §8: refunds one person's online payment — the price only, the service fee
 * stays with us — as long as the organizer hasn't been paid out yet (§5).
 * The caller has already checked the requester organizes this event.
 */
export async function refundRsvpPayment(db: Db, gateway: PaymentGateway, input: { rsvpId: string }, now: Date) {
  const rsvp = await db.rsvp.findUniqueOrThrow({ where: { id: input.rsvpId }, include: { event: true } });

  if (!canRefundOnline(rsvp.event, now)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The organizer has been paid out — refunds now happen outside the app." });
  }

  const payments = await db.payment.findMany({ where: { ...refundablePaymentsWhere(), rsvpId: input.rsvpId } });
  let refundedCents = 0;

  for (const payment of payments) {
    refundedCents += await refundPayment(db, gateway, { paymentId: payment.id, includeFee: false });
  }

  if (refundedCents === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "There's nothing to refund." });
  }

  if (rsvp.userId !== null) {
    await notifyRefund(db, { userId: rsvp.userId, eventId: rsvp.eventId, cents: refundedCents });
  }

  return { refundedCents };
}
