import type { Db } from "@/server/db";
import { authorizeOrganizerRowAction } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";
import { resendPayLink } from "@/server/domains/payments";

/** Organizer nudges someone who owes: their pay link goes out again (§8). */
export async function sendPayLink(db: Db, input: { rsvpId: string; organizerId: string }, now: Date) {
  await authorizeOrganizerRowAction(db, { ...input, action: "SEND_PAY_LINK" }, now);
  await resendPayLink(db, { rsvpId: input.rsvpId });

  return { ok: true };
}
