import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import type { PaymentGateway } from "@/server/integrations/stripe";
import { countGoingTowardMax, promoteAfterSpotFreed } from "@/server/domains/rsvps/actions/notifyWaitlistOfOpenSpot";
import { releaseHold } from "@/server/domains/wallet";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { authorizeOrganizerRowAction, authorizeOrganizerRsvp } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

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
export async function removeRsvp(db: Db, gateway: PaymentGateway, input: RemoveRsvpInput, now: Date) {
  const rsvp = await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);

  if (rsvp.status !== RsvpStatus.GOING) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Already dropped out." });
  }

  await authorizeOrganizerRowAction(db, { ...input, action: "REMOVE" }, now);

  const goingCountBefore = await countGoingTowardMax(db, rsvp.eventId);
  const removed = await db.rsvp.update({
    where: { id: input.rsvpId },
    data: { status: RsvpStatus.CANCELLED },
  });

  await releaseHold(db, { rsvpId: removed.id }, now);

  // §9: tell the person, and tell the waitlist if their spot just opened.
  if (removed.userId !== null) {
    await notifyUsers(db, { userIds: [removed.userId], message: notificationRules.removedMessage(rsvp.event) });
  }
  await promoteAfterSpotFreed(db, gateway, { eventId: rsvp.eventId, leaver: removed, goingCountBefore }, now);

  return removed;
}
