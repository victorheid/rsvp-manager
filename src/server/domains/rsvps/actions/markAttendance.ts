import type { Db } from "@/server/db";
import { authorizeOrganizerRsvp } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

export interface MarkAttendanceInput {
  rsvpId: string;
  organizerId: string;
  /** null = unmarked, true = showed, false = no-show (§8). */
  attended: boolean | null;
}

/** Marks attendance after the event (§8), organizer only. */
export async function markAttendance(db: Db, input: MarkAttendanceInput) {
  await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);

  return db.rsvp.update({
    where: { id: input.rsvpId },
    data: { attended: input.attended },
  });
}
