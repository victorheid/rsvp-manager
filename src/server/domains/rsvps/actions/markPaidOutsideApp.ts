import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentStatus } from "@/generated/prisma/enums";
import { authorizeOrganizerRowAction, authorizeOrganizerRsvp } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

export interface MarkPaidOutsideAppInput {
  rsvpId: string;
  organizerId: string;
}

/**
 * Records cash (or other outside-the-app payment) as collected (§8).
 * Record-keeping only — no money moves. Organizer only.
 */
export async function markPaidOutsideApp(db: Db, input: MarkPaidOutsideAppInput, now: Date) {
  const rsvp = await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);

  if (rsvp.paymentStatus !== PaymentStatus.PENDING && rsvp.paymentStatus !== PaymentStatus.OWES) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Already ${rsvp.paymentStatus.toLowerCase().replace("_", " ")}.`,
    });
  }

  await authorizeOrganizerRowAction(db, { ...input, action: "MARK_PAID" }, now);

  return db.rsvp.update({
    where: { id: input.rsvpId },
    data: { paymentStatus: PaymentStatus.PAID_OUTSIDE_APP },
  });
}
