import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";

export interface GetRsvpsForOrganizerInput {
  eventId: string;
  organizerId: string;
}

/**
 * Organizer event list (§8): every RSVP for the event — going and dropped
 * out alike — with each player's no-show count for this group.
 */
export async function getRsvpsForOrganizer(db: Db, input: GetRsvpsForOrganizerInput) {
  const event = await db.event.findUnique({
    where: { id: input.eventId },
    include: {
      group: { select: { organizerId: true, name: true } },
      rsvps: {
        include: { user: { select: { id: true, firstName: true, lastInitial: true, phoneNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (event.group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can manage this event." });
  }

  const noShowCounts = await db.rsvp.groupBy({
    by: ["userId"],
    where: { attended: false, event: { groupId: event.groupId } },
    _count: { _all: true },
  });
  const noShowByUser = new Map(noShowCounts.map((row) => [row.userId, row._count._all]));

  return {
    event,
    rsvps: event.rsvps.map((rsvp) => ({ ...rsvp, noShowCount: noShowByUser.get(rsvp.userId) ?? 0 })),
  };
}
