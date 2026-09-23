import type { EventModel, RsvpModel } from "@/generated/prisma/models";

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

/** §3, §4: joining is only possible while the event is still open for it. */
export function isJoinableEventStatus(status: EventModel["status"]): boolean {
  return status === "OPEN" || status === "CONFIRMED";
}
