import type { Db } from "@/server/db";
import { EventStatus, PaymentMethod, PaymentStatus, RsvpStatus } from "@/generated/prisma/enums";
import { perHeadPriceCents } from "@/server/domains/events/rules";
import { realizeHold } from "@/server/domains/wallet";

/**
 * The write half of confirming an event (§3), shared by the organizer's
 * confirm and the cut-off job: locks the per-head price against the current
 * headcount, flips the status, and realizes every going wallet RSVP's hold
 * at that price (§5) — all in the caller's transaction, so either the
 * event is confirmed *and* wallets are debited, or neither. Card RSVPs are
 * charged afterwards by `chargeCardRsvpsForEvent`, since that calls the
 * payment provider.
 */
export async function lockPriceAndRealizeHolds(tx: Db, eventId: string, now: Date) {
  const event = await tx.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { rsvps: { where: { status: RsvpStatus.GOING } } },
  });
  const lockedPriceCents = perHeadPriceCents(event, event.rsvps.length);

  const confirmed = await tx.event.update({
    where: { id: eventId },
    data: { status: EventStatus.CONFIRMED, confirmedAt: now, lockedPriceCents },
  });

  for (const rsvp of event.rsvps) {
    if (rsvp.paymentMethod === PaymentMethod.WALLET && rsvp.userId !== null && rsvp.paymentStatus === PaymentStatus.HELD) {
      await realizeHold(tx, { userId: rsvp.userId, rsvpId: rsvp.id, priceCents: lockedPriceCents, feeScheduleId: event.feeScheduleId }, now);
      await tx.rsvp.update({ where: { id: rsvp.id }, data: { paymentStatus: PaymentStatus.CHARGED } });
    }
  }

  return { event: confirmed, rsvps: event.rsvps };
}
