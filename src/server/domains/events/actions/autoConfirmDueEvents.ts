import type { Db } from "@/server/db";
import { EventStatus, RsvpStatus } from "@/generated/prisma/enums";
import { perHeadPriceCents, shouldAutoConfirmAtCutoff } from "@/server/domains/events/rules";

/**
 * §3 "At cut-off": confirms every open event whose cut-off has passed,
 * auto-charge is on, and the minimum is met. System-triggered (the
 * background worker), so there's no organizer to authorize against —
 * unlike the manual confirmEvent action, this one runs the rule itself
 * instead of checking who's asking.
 */
export async function autoConfirmDueEvents(db: Db, now: Date) {
  const candidates = await db.event.findMany({
    where: { status: EventStatus.OPEN, autoChargeAtCutoff: true, cutoffAt: { lte: now } },
    include: { rsvps: { where: { status: RsvpStatus.GOING } } },
  });

  const confirmed = [];

  for (const event of candidates) {
    const headcount = event.rsvps.length;

    if (!shouldAutoConfirmAtCutoff(event, headcount, event.minPlayers, now)) {
      continue; // stays Open — §10.9 "not confirmed yet", organizer gets alerted (not built)
    }

    const updated = await db.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.CONFIRMED,
        confirmedAt: now,
        lockedPriceCents: perHeadPriceCents(event, headcount),
      },
    });

    confirmed.push(updated);
  }

  return confirmed;
}
