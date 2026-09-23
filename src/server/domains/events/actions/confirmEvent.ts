import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EventStatus, RsvpStatus } from "@/generated/prisma/enums";
import { perHeadPriceCents } from "@/server/domains/events/rules";

/**
 * Manual or auto confirm (§3). Locks the per-head price against current
 * headcount and flips status. Charging held wallet funds / cards is the
 * wallet domain's job — this action ends by returning the confirmed event
 * plus its going RSVPs, and the caller (router or the cut-off job) is
 * responsible for triggering `wallet.realizeHolds` / card charges after
 * commit, never inside this transaction (see CLAUDE.md: never call an
 * external service inside a DB transaction).
 *
 * TODO(wallet domain): wire up hold realization + card charge dispatch
 * once src/server/domains/wallet exists (specs/tasks.md §5).
 */
export async function confirmEvent(db: Db, eventId: string) {
  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      include: { rsvps: { where: { status: RsvpStatus.GOING } } },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND" });
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
      where: { id: eventId },
      data: {
        status: EventStatus.CONFIRMED,
        confirmedAt: new Date(),
        lockedPriceCents,
      },
    });

    return { event: confirmed, rsvps: event.rsvps };
  });
}
