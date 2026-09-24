import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus, WaitlistEntryStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { isWaitlistOpen, spotsHeldForOthers } from "@/server/domains/waitlist/rules";

export interface JoinWaitlistInput {
  eventId: string;
  userId: string;
}

/**
 * Joins the waitlist (§6): one tap, no mode and no payment method — they
 * pick how to pay when they take a spot. Only when the game is full (going
 * plus spots held for others). Joining again while waiting keeps their
 * place; someone who dropped out and comes back joins at the end.
 */
export async function joinWaitlist(db: Db, input: JoinWaitlistInput, now: Date) {
  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: {
        rsvps: { where: { status: RsvpStatus.GOING } },
        waitlistEntries: { where: { status: WaitlistEntryStatus.WAITING } },
      },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
    }

    if (!isWaitlistOpen(event, now)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The waitlist is closed — the event has started." });
    }

    const taken = event.rsvps.filter(eventRules.countsTowardMax).length + spotsHeldForOthers(event.waitlistEntries, input.userId, now);
    if (eventRules.hasCapacity(event, taken)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This event isn't full — just RSVP." });
    }

    if (event.rsvps.some((rsvp) => rsvp.userId === input.userId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You're already in." });
    }

    const rejoin = { status: WaitlistEntryStatus.WAITING, queuedAt: now, heldUntil: null, missedHoldAt: null, droppedAt: null };
    const existing = await tx.waitlistEntry.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
    });

    if (existing?.status === WaitlistEntryStatus.WAITING) {
      return existing;
    }

    return existing
      ? tx.waitlistEntry.update({ where: { id: existing.id }, data: rejoin })
      : tx.waitlistEntry.create({ data: { eventId: input.eventId, userId: input.userId, queuedAt: now } });
  });
}
