import type { Db } from "@/server/db";
import { authorizeOrganizerRowAction } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

export interface MarkAttendanceInput {
  rsvpId: string;
  organizerId: string;
  /** null = unmarked, true = showed, false = no-show (§8). */
  attended: boolean | null;
}

/** Marks attendance once the game has started (§8), organizer only. */
export async function markAttendance(db: Db, input: MarkAttendanceInput, now: Date) {
  await authorizeOrganizerRowAction(
    db,
    {
      rsvpId: input.rsvpId,
      organizerId: input.organizerId,
      action: input.attended === false ? "MARK_NO_SHOW" : "UNDO_NO_SHOW",
    },
    now,
  );

  return db.rsvp.update({
    where: { id: input.rsvpId },
    data: { attended: input.attended },
  });
}
