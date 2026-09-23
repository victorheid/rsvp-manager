import type { EventModel, WaitlistEntryModel } from "@/generated/prisma/models";

/**
 * Business rules for the waitlist (§6). Pure functions only: no Prisma
 * calls, no Date.now(), no I/O.
 */

/** §6: "The waitlist closes when the event starts." */
export function isWaitlistOpen(event: Pick<EventModel, "startsAt">, now: Date): boolean {
  return now < event.startsAt;
}

/**
 * §6 "Order": auto-join entries first, then notify-me entries; first come,
 * first served within each. Switching mode keeps the original join time, so
 * this is all it takes: sort by mode, then by when they joined.
 */
export function sortWaitlist<T extends Pick<WaitlistEntryModel, "promotionMode" | "createdAt">>(entries: readonly T[]): T[] {
  const rank = (entry: T) => (entry.promotionMode === "AUTO" ? 0 : 1);

  return [...entries].sort((a, b) => rank(a) - rank(b) || a.createdAt.getTime() - b.createdAt.getTime());
}
