import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { eventRules } from "@/server/domains/events";
import { organizerRowActions, type OrganizerRowAction } from "@/server/domains/rsvps/rules";

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

/**
 * Server-side twin of the Manage screen's per-person menu: the action must
 * be one `organizerRowActions` offers for this person right now. Keeps the
 * phase rules (no attendance before the game, no removal once it's
 * running…) in `rules.ts` instead of trusting the client to only offer
 * what's allowed.
 */
export async function authorizeOrganizerRowAction(
  db: Db,
  input: { rsvpId: string; organizerId: string; action: OrganizerRowAction },
  now: Date,
) {
  const rsvp = await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);
  const allowed = organizerRowActions({
    rsvp,
    phase: eventRules.eventPhase(rsvp.event, now),
    isOrganizersOwnRsvp: rsvp.userId === input.organizerId,
  });

  if (!allowed.includes(input.action)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That isn't possible at this stage of the game." });
  }

  return rsvp;
}
