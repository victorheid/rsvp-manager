import type { Db } from "@/server/db";
import { RsvpStatus, WaitlistEntryStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { isHoldActive, planWaitlist } from "@/server/domains/waitlist/rules";

/**
 * §6 "When a spot opens": applies `planWaitlist` — holds that ran out move
 * their person to the end of the line, free spots are held for the next
 * people (in-order events), and whatever's left is open to anyone.
 *
 * Call it after anything that may have freed a spot has committed (a
 * drop-out, someone marked dropped out, a hold given up), and from the
 * worker to expire holds and fill room the organizer added. `spotFreed`
 * says a spot just opened, so the waitlist hears about any open spot;
 * the worker only tells them when a hold running out opened one.
 */
export async function advanceWaitlist(db: Db, input: { eventId: string; spotFreed: boolean }, now: Date) {
  const result = await db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: {
        rsvps: { where: { status: RsvpStatus.GOING }, select: { userId: true } },
        waitlistEntries: { where: { status: WaitlistEntryStatus.WAITING } },
      },
    });
    const phase = event ? eventRules.eventPhase(event, now) : null;

    if (!event || (phase !== "OPEN" && phase !== "CONFIRMED")) {
      return null;
    }

    const plan = planWaitlist({
      event,
      entries: event.waitlistEntries,
      goingCount: event.rsvps.filter(eventRules.countsTowardMax).length,
      now,
    });

    for (const expired of plan.expire) {
      await tx.waitlistEntry.update({
        where: { id: expired.id },
        data: { heldUntil: null, missedHoldAt: expired.queuedAt, queuedAt: expired.queuedAt },
      });
    }

    for (const hold of plan.grant) {
      await tx.waitlistEntry.update({ where: { id: hold.id }, data: { heldUntil: hold.heldUntil } });
    }

    return { event, plan };
  });

  if (!result) {
    return null;
  }

  const { event, plan } = result;

  // Notifications go out after commit, never inside the transaction.
  for (const hold of plan.grant) {
    await notifyUsers(db, { userIds: [hold.userId], message: notificationRules.spotHeldMessage(event, hold.heldUntil) });
  }

  if (plan.openSpots > 0 && (input.spotFreed || plan.expire.length > 0)) {
    const granted = new Set(plan.grant.map((hold) => hold.userId));
    const waiting = event.waitlistEntries.filter((entry) => !granted.has(entry.userId) && !isHoldActive(entry, now));
    await notifyUsers(db, { userIds: waiting.map((entry) => entry.userId), message: notificationRules.spotOpenMessage(event) });
  }

  return plan;
}

/**
 * Worker sweep: expires holds that ran out and fills room nobody acted on
 * (say the organizer raised the max), for every game whose waitlist is
 * still open and has someone on it.
 */
export async function advanceWaitlists(db: Db, now: Date) {
  const events = await db.event.findMany({
    where: {
      status: { in: ["OPEN", "CONFIRMED"] },
      startsAt: { gt: now },
      waitlistEntries: { some: { status: WaitlistEntryStatus.WAITING } },
    },
    select: { id: true },
  });

  for (const event of events) {
    await advanceWaitlist(db, { eventId: event.id, spotFreed: false }, now);
  }
}
