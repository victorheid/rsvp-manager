import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { releaseHold } from "@/server/domains/wallet";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { advanceWaitlist } from "@/server/domains/waitlist";
import { authorizeOrganizerRowAction, authorizeOrganizerRsvp } from "@/server/domains/rsvps/actions/authorizeOrganizerRsvp";

export interface MarkRsvpDroppedOutInput {
  rsvpId: string;
  organizerId: string;
}

/**
 * Organizer marks a player as dropped out (§8) — say they told the group
 * chat they can't come. Same effect as them dropping out themselves:
 * before confirmation the spot is simply freed; after confirmation the
 * payment stays and they show as dropped out, refundable like anyone
 * else. Their spot goes to the waitlist (§6). Waitlisters are marked
 * dropped out by `markWaitlistDroppedOut` in the waitlist domain.
 */
export async function markRsvpDroppedOut(db: Db, input: MarkRsvpDroppedOutInput, now: Date) {
  const rsvp = await authorizeOrganizerRsvp(db, input.rsvpId, input.organizerId);

  if (rsvp.status !== RsvpStatus.GOING) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Already dropped out." });
  }

  await authorizeOrganizerRowAction(db, { ...input, action: "MARK_DROPPED_OUT" }, now);

  const dropped = await db.$transaction(async (tx) => {
    const updated = await tx.rsvp.update({
      where: { id: input.rsvpId },
      data: { status: RsvpStatus.CANCELLED },
    });
    await releaseHold(tx, { rsvpId: updated.id }, now);
    return updated;
  });

  // §9: tell the person (after commit), then hand their spot to the waitlist.
  if (dropped.userId !== null) {
    await notifyUsers(db, { userIds: [dropped.userId], message: notificationRules.markedDroppedOutMessage(rsvp.event) });
  }
  if (eventRules.countsTowardMax(dropped)) {
    await advanceWaitlist(db, { eventId: rsvp.eventId, spotFreed: true }, now);
  }

  return dropped;
}
