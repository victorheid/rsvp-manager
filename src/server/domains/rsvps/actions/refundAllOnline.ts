import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
import { paymentRules, refundRsvpPayment } from "@/server/domains/payments";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * Organizer refunds everyone who paid online (§8): prices back, service
 * fees kept, until payout (§5). One failed refund doesn't stop the rest;
 * the result says how many went through, and running it again retries
 * only what's left.
 */
export async function refundAllOnline(
  db: Db,
  gateway: PaymentGateway,
  input: { eventId: string; organizerId: string },
  now: Date,
) {
  const event = await db.event.findUnique({
    where: { id: input.eventId },
    include: { group: { select: { organizerId: true } } },
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (event.group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can refund this event." });
  }

  if (!paymentRules.canRefundOnline(event, now)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The organizer has been paid out — refunds now happen outside the app." });
  }

  const paid = await db.rsvp.findMany({
    where: { eventId: event.id, paymentStatus: PaymentStatus.CHARGED, paymentMethod: { not: PaymentMethod.CASH } },
    select: { id: true },
  });

  let refunded = 0;
  let refundedCents = 0;

  for (const rsvp of paid) {
    try {
      const result = await refundRsvpPayment(db, gateway, { rsvpId: rsvp.id }, now);
      refunded += 1;
      refundedCents += result.refundedCents;
    } catch (error) {
      console.error(`[rsvps] refunding rsvp ${rsvp.id} failed`, error);
    }
  }

  return { refunded, failed: paid.length - refunded, refundedCents };
}
