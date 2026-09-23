import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { freedAWaitlistedSpot } from "@/server/domains/rsvps/rules";
import type { RsvpModel } from "@/generated/prisma/models";

/**
 * §9 "Spot open": after someone leaves, tells the waitlist if that freed a
 * spot on a full event. Everyone on the waitlist is "notify me" for now
 * (auto-join needs §5), so it's first to claim wins. Call it after the
 * leaving has committed, with the count of going players from *before* it.
 */
export async function notifyWaitlistOfOpenSpot(
  db: Db,
  input: { eventId: string; leaver: Pick<RsvpModel, "userId">; goingCountBefore: number },
  now: Date,
) {
  const event = await db.event.findUnique({ where: { id: input.eventId } });

  // The waitlist closes at the start (§6): once the game is running or over, nobody's waiting.
  const phase = event ? eventRules.eventPhase(event, now) : null;

  if (!event || (phase !== "OPEN" && phase !== "CONFIRMED") || !freedAWaitlistedSpot(event, input.leaver, input.goingCountBefore)) {
    return;
  }

  const waiting = await db.waitlistEntry.findMany({ where: { eventId: event.id }, select: { userId: true } });
  await notifyUsers(db, {
    userIds: waiting.map((entry) => entry.userId),
    message: notificationRules.spotOpenMessage(event),
  });
}

/** How many going players count against the event's max right now (walk-ins don't, §8). */
export async function countGoingTowardMax(db: Db, eventId: string) {
  const going = await db.rsvp.findMany({ where: { eventId, status: RsvpStatus.GOING }, select: { userId: true } });
  return going.filter(eventRules.countsTowardMax).length;
}
