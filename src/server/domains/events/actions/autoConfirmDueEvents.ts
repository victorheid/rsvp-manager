import type { Db } from "@/server/db";
import { EventStatus, RsvpStatus } from "@/generated/prisma/enums";
import { notifyEventAudience } from "@/server/domains/events/actions/notifyEventAudience";
import { notificationRules } from "@/server/domains/notifications";
import { lockPriceAndRealizeHolds } from "@/server/domains/events/actions/lockPriceAndRealizeHolds";
import { shouldAutoConfirmAtCutoff } from "@/server/domains/events/rules";
import { chargeCardRsvpsForEvent } from "@/server/domains/payments";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * §3 "At cut-off": confirms every open event whose cut-off has passed,
 * auto-charge is on, and the minimum is met. System-triggered (the
 * background worker), so there's no organizer to authorize against —
 * unlike the manual confirmEvent action, this one runs the rule itself
 * instead of checking who's asking.
 */
export async function autoConfirmDueEvents(db: Db, gateway: PaymentGateway, now: Date) {
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

    const { event: updated } = await db.$transaction((tx) => lockPriceAndRealizeHolds(tx, event.id, now));
    await chargeCardRsvpsForEvent(db, gateway, { eventId: event.id });

    confirmed.push(updated);

    await notifyEventAudience(db, {
      eventId: event.id,
      message: notificationRules.eventConfirmedMessage(updated),
      includeWaitlist: false,
    });
  }

  return confirmed;
}
