import type { Db } from "@/server/db";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { refundPayment, refundablePaymentsWhere } from "@/server/domains/payments/actions/refundPayment";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * §7: when the organizer cancels an event, every online payment is
 * refunded in full — service fee included, the one time it's given back.
 * Includes people who dropped out after paying. One failed refund doesn't
 * stop the others; it's logged, and running this again retries only what's
 * left. Run after the cancellation has committed.
 */
export async function refundEventPayments(db: Db, gateway: PaymentGateway, input: { eventId: string }) {
  const payments = await db.payment.findMany({
    where: { ...refundablePaymentsWhere(), rsvp: { eventId: input.eventId } },
  });

  for (const payment of payments) {
    try {
      await refundPayment(db, gateway, { paymentId: payment.id, includeFee: true });
    } catch (error) {
      console.error(`[payments] refunding payment ${payment.id} failed`, error);
    }
  }
}

/** Tells one person their money is coming back (§9 "Refund issued"). */
export async function notifyRefund(db: Db, input: { userId: string; eventId: string; cents: number }) {
  const event = await db.event.findUniqueOrThrow({ where: { id: input.eventId } });
  await notifyUsers(db, { userIds: [input.userId], message: notificationRules.refundIssuedMessage(event, input.cents) });
}

/**
 * §7 safety net for the worker: a cancellation's refunds run right after it
 * commits, but the provider can be down. This sweeps cancelled events for
 * payments not fully refunded yet and retries them, fee included.
 */
export async function retryCancelledEventRefunds(db: Db, gateway: PaymentGateway) {
  const payments = await db.payment.findMany({
    where: { ...refundablePaymentsWhere(), rsvp: { event: { status: "CANCELLED" } } },
  });
  const outstanding = payments.filter((payment) => payment.refundedCents < payment.amountCents || payment.feeRefundedCents < payment.feeCents);
  let retried = 0;

  for (const payment of outstanding) {
    try {
      retried += (await refundPayment(db, gateway, { paymentId: payment.id, includeFee: true })) > 0 ? 1 : 0;
    } catch (error) {
      console.error(`[payments] retrying refund of payment ${payment.id} failed`, error);
    }
  }

  return retried;
}
