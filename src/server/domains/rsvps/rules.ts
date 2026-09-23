import type { EventModel, RsvpModel } from "@/generated/prisma/models";
import type { EventPhase } from "@/server/domains/events";

/**
 * Business rules for RSVPs (spec §4, §6, §8). Pure functions only: no
 * Prisma calls, no Date.now(), no I/O.
 */

/** §8: "Walk-ins don't count towards the max." */
export function countsTowardMax(rsvp: Pick<RsvpModel, "userId">): boolean {
  return rsvp.userId !== null;
}

/** §6: once an event is at capacity, new RSVPs go to the waitlist instead. */
export function hasCapacity(
  event: Pick<EventModel, "maxPlayers">,
  goingCount: number,
): boolean {
  return event.maxPlayers === null || goingCount < event.maxPlayers;
}

/**
 * §9 "Spot open": whether someone leaving just freed a spot that the
 * waitlist was waiting on — the event was full before, and the leaver held
 * a real spot (walk-ins don't count against max, §8).
 */
export function freedAWaitlistedSpot(
  event: Pick<EventModel, "maxPlayers">,
  leaver: Pick<RsvpModel, "userId">,
  goingCountBefore: number,
): boolean {
  return countsTowardMax(leaver) && !hasCapacity(event, goingCountBefore);
}

/** §3, §4: joining is only possible while the event is still open for it. */
export function isJoinableEventStatus(status: EventModel["status"]): boolean {
  return status === "OPEN" || status === "CONFIRMED";
}

/**
 * §8: nobody is marked as attending. Everyone counts as having shown up
 * unless the organizer marks them a no-show (`attended === false`), so the
 * organizer only ever records the exception. `null` means "not marked",
 * which reads as showed.
 */
export function hasShownUp(rsvp: Pick<RsvpModel, "attended">): boolean {
  return rsvp.attended !== false;
}

/** Things the organizer can do to one person from the Manage screen. */
export type OrganizerRowAction = "MARK_PAID" | "MARK_NO_SHOW" | "UNDO_NO_SHOW" | "REFUND" | "REMOVE";

/**
 * Which per-person actions exist right now (UI spec §10.5). The list is in
 * "most likely next" order — the menu leads with its first item — and is
 * empty when there's nothing sensible to do.
 *
 *  - Mark paid: only once the game is confirmed. Before that nothing has
 *    been charged, and cash is collected on the day.
 *  - Refund: an online payment that went through, until the organizer is
 *    paid out (`refundsOpen`, §5). It stays on someone who dropped out —
 *    that's where the organizer decides to refund them (§4) — and it
 *    leads for them, as their only action.
 *  - Remove: only before the game starts. Once it's running, someone who
 *    isn't there is a no-show, not a removal.
 *  - No-show / undo: only once the game has started, and never on the
 *    organizer's own RSVP.
 */
export function organizerRowActions(input: {
  rsvp: Pick<RsvpModel, "status" | "paymentStatus" | "paymentMethod" | "attended">;
  phase: EventPhase;
  isOrganizersOwnRsvp: boolean;
  /** Payout not released yet (§5): refunds still happen in the app. */
  refundsOpen: boolean;
}): OrganizerRowAction[] {
  const { rsvp, phase, isOrganizersOwnRsvp, refundsOpen } = input;
  const isGoing = rsvp.status === "GOING";
  const gameStarted = phase === "LIVE" || phase === "FINISHED";
  const paymentDue = rsvp.paymentStatus === "PENDING" || rsvp.paymentStatus === "OWES";
  const actions: OrganizerRowAction[] = [];

  if (isGoing && gameStarted && !isOrganizersOwnRsvp && !hasShownUp(rsvp)) {
    actions.push("UNDO_NO_SHOW");
  }

  if (paymentDue && (phase === "CONFIRMED" || gameStarted)) {
    actions.push("MARK_PAID");
  }

  if (isGoing && gameStarted && !isOrganizersOwnRsvp && hasShownUp(rsvp)) {
    actions.push("MARK_NO_SHOW");
  }

  if (rsvp.paymentStatus === "CHARGED" && rsvp.paymentMethod !== "CASH" && refundsOpen) {
    actions.push("REFUND");
  }

  if (isGoing && !isOrganizersOwnRsvp && (phase === "OPEN" || phase === "CONFIRMED")) {
    actions.push("REMOVE");
  }

  return actions;
}
