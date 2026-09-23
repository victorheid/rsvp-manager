import type { Db } from "@/server/db";
import { PaymentMethod, RsvpStatus, WaitlistPromotionMode } from "@/generated/prisma/enums";
import type { RsvpModel } from "@/generated/prisma/models";
import { eventRules } from "@/server/domains/events";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { createRsvp } from "@/server/domains/rsvps/actions/createRsvp";
import { freedAWaitlistedSpot } from "@/server/domains/rsvps/rules";
import { waitlistRules } from "@/server/domains/waitlist";
import type { PaymentGateway } from "@/server/integrations/stripe";

/** How many going players count against the event's max right now (walk-ins don't, §8). */
export async function countGoingTowardMax(db: Db, eventId: string) {
  const going = await db.rsvp.findMany({ where: { eventId, status: RsvpStatus.GOING }, select: { userId: true } });
  return going.filter(eventRules.countsTowardMax).length;
}

/**
 * §6 "When a spot opens": moves auto-join entries in, in order, while there
 * is room — normal RSVP rules apply, so a wallet entry gets a hold (or is
 * debited on a confirmed event) and a card entry is charged at
 * confirmation (or at once on a confirmed event). An entry that can't be
 * moved in (say the wallet can't cover it) is skipped, told so, and keeps
 * its place. With `notifyManual`, if room is still left afterwards, all
 * notify-me entries hear a spot is open — first to claim wins, no timer.
 *
 * The waitlist closes at the start, so nothing happens once the game is
 * running or over. Call after whatever freed the spot has committed.
 */
export async function promoteFromWaitlist(
  db: Db,
  gateway: PaymentGateway,
  input: { eventId: string; notifyManual: boolean },
  now: Date,
) {
  const skipped = new Set<string>();

  async function openEvent() {
    const event = await db.event.findUnique({ where: { id: input.eventId } });
    const phase = event ? eventRules.eventPhase(event, now) : null;
    return event && (phase === "OPEN" || phase === "CONFIRMED") ? event : null;
  }

  for (;;) {
    const event = await openEvent();

    if (!event || eventRules.hasCapacity(event, await countGoingTowardMax(db, event.id)) === false) {
      return;
    }

    const entries = waitlistRules.sortWaitlist(await db.waitlistEntry.findMany({ where: { eventId: event.id } }));
    const next = entries.find((entry) => entry.promotionMode === WaitlistPromotionMode.AUTO && !skipped.has(entry.userId));

    if (!next?.paymentMethod) {
      break;
    }

    try {
      await createRsvp(db, gateway, {
        eventId: event.id,
        userId: next.userId,
        paymentMethod: next.paymentMethod,
        savedCard:
          next.paymentMethod === PaymentMethod.CARD && next.stripePaymentMethodId
            ? { paymentMethodId: next.stripePaymentMethodId, brand: next.cardBrand ?? "unknown", last4: next.cardLast4 ?? "" }
            : undefined,
      });
      await notifyUsers(db, { userIds: [next.userId], message: notificationRules.movedInMessage(event) });
    } catch (error) {
      console.error(`[rsvps] couldn't move ${next.userId} in from the waitlist`, error);
      skipped.add(next.userId);
      await notifyUsers(db, { userIds: [next.userId], message: notificationRules.autoJoinSkippedMessage(event) });
    }
  }

  const event = await openEvent();

  if (input.notifyManual && event && eventRules.hasCapacity(event, await countGoingTowardMax(db, event.id))) {
    const waiting = await db.waitlistEntry.findMany({
      where: { eventId: event.id, promotionMode: WaitlistPromotionMode.MANUAL },
      select: { userId: true },
    });
    await notifyUsers(db, { userIds: waiting.map((entry) => entry.userId), message: notificationRules.spotOpenMessage(event) });
  }
}

/**
 * After someone leaves: if that freed a spot on a full event, run the
 * waitlist (`goingCountBefore` is the count from before they left).
 */
export async function promoteAfterSpotFreed(
  db: Db,
  gateway: PaymentGateway,
  input: { eventId: string; leaver: Pick<RsvpModel, "userId">; goingCountBefore: number },
  now: Date,
) {
  const event = await db.event.findUnique({ where: { id: input.eventId } });

  if (event && freedAWaitlistedSpot(event, input.leaver, input.goingCountBefore)) {
    await promoteFromWaitlist(db, gateway, { eventId: input.eventId, notifyManual: true }, now);
  }
}

/**
 * Worker sweep: moves auto-join entries into any room that exists but
 * nobody acted on — e.g. the organizer raised the max. Doesn't re-notify
 * notify-me entries; that happens once, when the spot is freed.
 */
export async function promoteWaitlists(db: Db, gateway: PaymentGateway, now: Date) {
  const events = await db.event.findMany({
    where: {
      status: { in: ["OPEN", "CONFIRMED"] },
      startsAt: { gt: now },
      waitlistEntries: { some: { promotionMode: WaitlistPromotionMode.AUTO } },
    },
    select: { id: true },
  });

  for (const event of events) {
    await promoteFromWaitlist(db, gateway, { eventId: event.id, notifyManual: false }, now);
  }
}
