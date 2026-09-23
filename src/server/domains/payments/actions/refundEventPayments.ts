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
