import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { releaseHold } from "@/server/domains/wallet";
import { advanceWaitlist } from "@/server/domains/waitlist";

export interface DropRsvpInput {
  eventId: string;
  userId: string;
}

/**
 * Drops out of an event (§3, §4). Always possible up to the event start;
 * nothing is refunded automatically — that's the organizer's call from
 * their event list (§8), not this action's job. Their spot goes to the
 * waitlist (§6).
 */
export async function dropRsvp(db: Db, input: DropRsvpInput, now: Date) {
  const dropped = await db.$transaction(async (tx) => {
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

    const updated = await tx.rsvp.update({
      where: { id: rsvp.id },
      data: { status: RsvpStatus.CANCELLED },
    });

    // §5: dropping out before confirmation frees the wallet hold. After it, the
    // money stays where it is — refunds are the organizer's call.
    await releaseHold(tx, { rsvpId: rsvp.id }, now);

    return updated;
  });

  if (eventRules.countsTowardMax(dropped)) {
    await advanceWaitlist(db, { eventId: input.eventId, spotFreed: true }, now);
  }

  return dropped;
}
