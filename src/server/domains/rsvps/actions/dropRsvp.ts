import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";

export interface DropRsvpInput {
  eventId: string;
  userId: string;
}

/**
 * Drops out of an event (§3, §4). Always possible up to the event start;
 * nothing is refunded automatically — that's the organizer's call from
 * their event list (§8), not this action's job.
 */
export async function dropRsvp(db: Db, input: DropRsvpInput, now: Date) {
  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: input.eventId } });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
    }

    const rsvp = await tx.rsvp.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
    });

    if (!rsvp || rsvp.status !== RsvpStatus.GOING) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You're not in this event." });
    }

    if (!eventRules.canSelfCancel(event, now)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Too late to drop out — the event has started." });
    }

    return tx.rsvp.update({
      where: { id: rsvp.id },
      data: { status: RsvpStatus.CANCELLED },
    });
  });
}
