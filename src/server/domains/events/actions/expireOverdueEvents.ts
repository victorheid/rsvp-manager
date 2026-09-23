import type { Db } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";
import { releaseHolds } from "@/server/domains/wallet";
import { isExpired } from "@/server/domains/events/rules";

/**
 * §7: an Open event still unconfirmed 48h after its start expires. Nobody
 * was charged, so it only releases wallet holds (§5); saved cards are never
 * charged. System-triggered, like autoConfirmDueEvents.
 */
export async function expireOverdueEvents(db: Db, now: Date) {
  const candidates = await db.event.findMany({ where: { status: EventStatus.OPEN } });
  const toExpire = candidates.filter((event) => isExpired(event, now));

  if (toExpire.length === 0) {
    return [];
  }

  const eventIds = toExpire.map((event) => event.id);

  await db.$transaction(async (tx) => {
    await tx.event.updateMany({ where: { id: { in: eventIds } }, data: { status: EventStatus.EXPIRED } });

    const rsvps = await tx.rsvp.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
    await releaseHolds(tx, { rsvpIds: rsvps.map((rsvp) => rsvp.id) }, now);
  });

  return toExpire;
}
