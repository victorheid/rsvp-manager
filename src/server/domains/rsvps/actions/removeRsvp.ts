import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import { authorizeOrganizerRsvp } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

export interface RemoveRsvpInput {
  rsvpId: string;
  organizerId: string;
}

/**
 * Organizer removes a player (§8) — same effect as them dropping out
 * themselves: before confirmation the spot is simply freed; after
 * confirmation the payment stays and they show as dropped out,
 * refundable like anyone else (refunds need §5, not built yet).
 */
export async function removeRsvp(db: Db, input: RemoveRsvpInput) {
  const rsvp = await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);

  if (rsvp.status !== RsvpStatus.GOING) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Already dropped out." });
  }

  return db.rsvp.update({
    where: { id: input.rsvpId },
    data: { status: RsvpStatus.CANCELLED },
  });
}
