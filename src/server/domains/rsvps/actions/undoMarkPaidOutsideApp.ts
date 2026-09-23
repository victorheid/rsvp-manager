import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentStatus } from "@/generated/prisma/enums";
import { authorizeOrganizerRsvp } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

export interface UndoMarkPaidOutsideAppInput {
  rsvpId: string;
  organizerId: string;
  /** What the payment status was before it was marked paid — the caller knows, we don't store history. */
  restoreTo: typeof PaymentStatus.PENDING | typeof PaymentStatus.OWES;
}

/**
 * Reverses "Mark paid outside app" (§8) — the Undo on its toast. Like the
 * action it undoes, record-keeping only: no money moves. Only valid while
 * the payment is still marked as paid outside the app.
 */
export async function undoMarkPaidOutsideApp(db: Db, input: UndoMarkPaidOutsideAppInput) {
  const rsvp = await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);

  if (rsvp.paymentStatus !== PaymentStatus.PAID_OUTSIDE_APP) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This payment isn't marked as paid outside the app." });
  }

  return db.rsvp.update({
    where: { id: input.rsvpId },
    data: { paymentStatus: input.restoreTo },
  });
}
