import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";

/**
 * Shared by the organizer-only RSVP actions (markAttendance,
 * markPaidOutsideApp, removeRsvp): loads the RSVP and checks the caller
 * organizes its event's group. Not exported from the domain's index —
 * it's private plumbing for this domain's own actions.
 */
export async function authorizeOrganizerRsvp(db: Db, rsvpId: string, organizerId: string) {
  const rsvp = await db.rsvp.findUnique({
    where: { id: rsvpId },
    include: { event: { include: { group: { select: { organizerId: true } } } } },
  });

  if (!rsvp) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (rsvp.event.group.organizerId !== organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can do this." });
  }

  return rsvp;
}
