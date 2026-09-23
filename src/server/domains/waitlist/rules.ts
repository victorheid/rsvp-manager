import type { EventModel } from "@/generated/prisma/models";

/**
 * Business rules for the waitlist (§6). Pure functions only: no Prisma
 * calls, no Date.now(), no I/O.
 */

/** §6: "The waitlist closes when the event starts." */
export function isWaitlistOpen(event: Pick<EventModel, "startsAt">, now: Date): boolean {
  return now < event.startsAt;
}
