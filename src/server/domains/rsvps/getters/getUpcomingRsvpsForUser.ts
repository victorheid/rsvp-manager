import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";

/**
 * UI spec §6 (Games/Home): the events a signed-in user is going to,
 * soonest first.
 */
export async function getUpcomingRsvpsForUser(db: Db, userId: string, now: Date) {
  return db.rsvp.findMany({
    where: { userId, status: RsvpStatus.GOING, event: { startsAt: { gte: now } } },
    include: { event: { include: { group: { select: { name: true, slug: true } } } } },
    orderBy: { event: { startsAt: "asc" } },
  });
}
