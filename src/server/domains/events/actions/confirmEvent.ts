import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EventStatus, RsvpStatus } from "@/generated/prisma/enums";
import { perHeadPriceCents } from "@/server/domains/events/rules";

export interface ConfirmEventInput {
  eventId: string;
  organizerId: string;
}

/**
 * Manual or auto confirm (§3), organizer only. Locks the per-head price
 * against current headcount and flips status. Charging held wallet funds /
 * cards is the wallet domain's job — this action ends by returning the
 * confirmed event plus its going RSVPs, and the caller (router or the
 * cut-off job) is responsible for triggering `wallet.realizeHolds` / card
 * charges after commit, never inside this transaction (see CLAUDE.md:
 * never call an external service inside a transaction).
 *
 * TODO(wallet domain): wire up hold realization + card charge dispatch
 * once src/server/domains/wallet exists (specs/tasks.md §5).
 */
export async function confirmEvent(db: Db, input: ConfirmEventInput) {
  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: {
        rsvps: { where: { status: RsvpStatus.GOING } },
        group: { select: { organizerId: true } },
      },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (event.group.organizerId !== input.organizerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can confirm this event." });
    }

    if (event.status !== EventStatus.OPEN) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Event is ${event.status.toLowerCase()}, not open.`,
      });
    }

    const headcount = event.rsvps.length;

    if (headcount < event.minPlayers) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Minimum players not met.",
      });
    }

    const lockedPriceCents = perHeadPriceCents(event, headcount);

    const confirmed = await tx.event.update({
      where: { id: input.eventId },
      data: {
        status: EventStatus.CONFIRMED,
        confirmedAt: new Date(),
        lockedPriceCents,
      },
    });

    return { event: confirmed, rsvps: event.rsvps };
  });
}
