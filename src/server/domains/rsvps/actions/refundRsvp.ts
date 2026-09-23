import type { Db } from "@/server/db";
import { authorizeOrganizerRowAction } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";
import { refundRsvpPayment } from "@/server/domains/payments";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * Organizer refunds one person's online payment (§8): the price goes back,
 * the service fee stays. Only while the row offers Refund — an online
 * payment that went through, before the organizer's payout.
 */
export async function refundRsvp(
  db: Db,
  gateway: PaymentGateway,
  input: { rsvpId: string; organizerId: string },
  now: Date,
) {
  await authorizeOrganizerRowAction(db, { ...input, action: "REFUND" }, now);

  return refundRsvpPayment(db, gateway, { rsvpId: input.rsvpId }, now);
}
