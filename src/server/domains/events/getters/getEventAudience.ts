import type { Db } from "@/server/db";
import { RsvpStatus, WaitlistEntryStatus } from "@/generated/prisma/enums";

/**
 * Who has a stake in an event, for notifications (§9): everyone going and
 * everyone on the waitlist. Walk-ins have no account, so they're skipped.
 */
export async function getEventAudience(db: Db, eventId: string) {
  const [going, waitlist] = await Promise.all([
    db.rsvp.findMany({ where: { eventId, status: RsvpStatus.GOING, userId: { not: null } }, select: { userId: true } }),
    db.waitlistEntry.findMany({ where: { eventId, status: WaitlistEntryStatus.WAITING }, select: { userId: true } }),
  ]);

  return {
    goingUserIds: going.flatMap((rsvp) => (rsvp.userId === null ? [] : [rsvp.userId])),
    waitlistUserIds: waitlist.map((entry) => entry.userId),
  };
}
