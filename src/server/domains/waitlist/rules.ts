import type { EventModel, WaitlistEntryModel } from "@/generated/prisma/models";
import type { EventPhase } from "@/server/domains/events";

/**
 * Business rules for the waitlist (§6). Pure functions only: no Prisma
 * calls, no Date.now(), no I/O.
 */

type QueuedEntry = Pick<WaitlistEntryModel, "id" | "userId" | "status" | "queuedAt" | "heldUntil" | "missedHoldAt">;

/** §6: "The waitlist closes when the event starts." */
export function isWaitlistOpen(event: Pick<EventModel, "startsAt">, now: Date): boolean {
  return now < event.startsAt;
}

/**
 * §6 "Order": first come, first served. Only people still waiting, by their
 * place in line — which moves to the end when a hold runs out on them.
 */
export function sortWaitlist<T extends Pick<WaitlistEntryModel, "status" | "queuedAt">>(entries: readonly T[]): T[] {
  return entries
    .filter((entry) => entry.status === "WAITING")
    .sort((a, b) => a.queuedAt.getTime() - b.queuedAt.getTime());
}

/** A spot is held for this person right now (in-order waitlist, §6). */
export function isHoldActive(entry: Pick<WaitlistEntryModel, "status" | "heldUntil">, now: Date): boolean {
  return entry.status === "WAITING" && entry.heldUntil !== null && entry.heldUntil > now;
}

/**
 * §6: "A held spot counts against max." How many spots are held for other
 * people — so the person a spot is held for can take it, and nobody else can.
 */
export function spotsHeldForOthers(
  entries: readonly Pick<WaitlistEntryModel, "userId" | "status" | "heldUntil">[],
  userId: string | null,
  now: Date,
): number {
  return entries.filter((entry) => entry.userId !== userId && isHoldActive(entry, now)).length;
}

/**
 * When a spot held now would stop being held, or null when the spot isn't
 * held at all and is open to the whole waitlist: the event is "first to
 * claim", or a hold would run past the start (nobody should be sitting on a
 * spot at kick-off).
 */
export function holdEndsAt(
  event: Pick<EventModel, "waitlistMode" | "waitlistHoldMinutes" | "startsAt">,
  now: Date,
): Date | null {
  if (event.waitlistMode !== "IN_ORDER") {
    return null;
  }

  const endsAt = new Date(now.getTime() + event.waitlistHoldMinutes * 60_000);
  return endsAt > event.startsAt ? null : endsAt;
}

export interface WaitlistPlan {
  /** Holds that ran out: the person moves to the end of the line (queued at the moment it ran out). */
  expire: { id: string; userId: string; queuedAt: Date }[];
  /** New holds, for the next people in line. */
  grant: { id: string; userId: string; heldUntil: Date }[];
  /** Free spots nobody holds: anyone can take them, first come first served. */
  openSpots: number;
}

/**
 * §6 "When a spot opens": what the waitlist should look like now.
 *
 *  - A hold that ran out moves its person to the end of the line. They're
 *    not held a spot again (otherwise someone who never answers would sit
 *    on it for ever), but they can still take an open one.
 *  - Every free spot — room under max that isn't going or held — is held
 *    for the next person in line who hasn't missed a hold, if the event is
 *    in order and a hold would end before the start.
 *  - Whatever's left is open: anyone can take it.
 *
 * `goingCount` is the people counting against max (walk-ins don't, §8).
 * Returns an empty plan once the waitlist has closed.
 */
export function planWaitlist(input: {
  event: Pick<EventModel, "maxPlayers" | "waitlistMode" | "waitlistHoldMinutes" | "startsAt">;
  entries: readonly QueuedEntry[];
  goingCount: number;
  now: Date;
}): WaitlistPlan {
  const { event, now } = input;

  if (!isWaitlistOpen(event, now) || event.maxPlayers === null) {
    return { expire: [], grant: [], openSpots: 0 };
  }

  const waiting = sortWaitlist(input.entries);
  const expire = waiting.flatMap((entry) =>
    entry.heldUntil !== null && entry.heldUntil <= now ? [{ id: entry.id, userId: entry.userId, queuedAt: entry.heldUntil }] : [],
  );
  const expiredIds = new Set(expire.map((entry) => entry.id));
  const held = waiting.filter((entry) => isHoldActive(entry, now)).length;
  const free = Math.max(0, event.maxPlayers - input.goingCount - held);

  const endsAt = holdEndsAt(event, now);

  if (!endsAt) {
    return { expire, grant: [], openSpots: free };
  }

  const grant = waiting
    .filter((entry) => entry.heldUntil === null && entry.missedHoldAt === null && !expiredIds.has(entry.id))
    .slice(0, free)
    .map((entry) => ({ id: entry.id, userId: entry.userId, heldUntil: endsAt }));

  return { expire, grant, openSpots: free - grant.length };
}

export type OrganizerWaitlistRowAction = "MARK_DROPPED_OUT";

/**
 * What the organizer can do to someone on the waitlist (UI spec §10.5):
 * mark them dropped out, while they're still waiting and before the game
 * starts.
 */
export function organizerWaitlistRowActions(
  entry: Pick<WaitlistEntryModel, "status">,
  phase: EventPhase,
): OrganizerWaitlistRowAction[] {
  return entry.status === "WAITING" && (phase === "OPEN" || phase === "CONFIRMED") ? ["MARK_DROPPED_OUT"] : [];
}
