import type { Db } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";
import { notifyEventAudience } from "@/server/domains/events/actions/notifyEventAudience";
import { CUTOFF_REMINDER_LEAD_MS, isCutoffReminderDue } from "@/server/domains/events/rules";
import { notificationRules } from "@/server/domains/notifications";

/**
 * §9 cut-off reminder: tells everyone in, and the waitlist, that sign-ups
 * are about to close. System-triggered (the background worker). Each event
 * is claimed with a conditional update before anyone is notified, so a
 * second worker tick — or a second worker — can't send it twice.
 */
export async function sendCutoffReminders(db: Db, now: Date) {
  const candidates = await db.event.findMany({
    where: {
      status: EventStatus.OPEN,
      cutoffReminderSentAt: null,
      cutoffAt: { gt: now, lte: new Date(now.getTime() + CUTOFF_REMINDER_LEAD_MS) },
    },
  });

  const reminded = [];

  for (const event of candidates) {
    if (!isCutoffReminderDue(event, now)) {
      continue;
    }

    const claimed = await db.event.updateMany({
      where: { id: event.id, cutoffReminderSentAt: null },
      data: { cutoffReminderSentAt: now },
    });

    if (claimed.count === 0) {
      continue;
    }

    await notifyEventAudience(db, {
      eventId: event.id,
      message: notificationRules.cutoffReminderMessage(event),
      includeWaitlist: true,
    });
    reminded.push(event);
  }

  return reminded;
}
