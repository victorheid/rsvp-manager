import type { Db } from "@/server/db";
import { EventStatus, RsvpStatus } from "@/generated/prisma/enums";
import { needsOrganizerCutoffAlert } from "@/server/domains/events/rules";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";

/**
 * §9: alerts the organizer when an event's cut-off has passed and it's
 * still Open — the minimum wasn't met, or auto-charge is off — so they can
 * decide. System-triggered (the background worker); run it after
 * `autoConfirmDueEvents` so games that confirmed themselves aren't flagged.
 * Once per event: it's claimed with a conditional update before the alert
 * goes out.
 */
export async function alertOrganizersOfUnconfirmedEvents(db: Db, now: Date) {
  const candidates = await db.event.findMany({
    where: { status: EventStatus.OPEN, organizerAlertedAt: null, cutoffAt: { lte: now }, startsAt: { gt: now } },
    include: {
      group: { select: { organizerId: true } },
      rsvps: { where: { status: RsvpStatus.GOING }, select: { id: true } },
    },
  });

  const alerted = [];

  for (const event of candidates) {
    const headcount = event.rsvps.length;

    if (!needsOrganizerCutoffAlert(event, headcount, now)) {
      continue;
    }

    const claimed = await db.event.updateMany({
      where: { id: event.id, organizerAlertedAt: null },
      data: { organizerAlertedAt: now },
    });

    if (claimed.count === 0) {
      continue;
    }

    await notifyUsers(db, {
      userIds: [event.group.organizerId],
      message: notificationRules.organizerCutoffAlertMessage(event, headcount),
    });
    alerted.push(event);
  }

  return alerted;
}
