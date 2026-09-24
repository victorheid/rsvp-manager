import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { eventRules } from "@/server/domains/events";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { dropFromWaitlist } from "@/server/domains/waitlist/actions/leaveWaitlist";
import { organizerWaitlistRowActions } from "@/server/domains/waitlist/rules";

export interface MarkWaitlistDroppedOutInput {
  entryId: string;
  organizerId: string;
}

/**
 * Organizer marks someone on the waitlist as dropped out (§8) — they said
 * in the chat they aren't coming. They leave the waitlist and show under
 * Dropped out; a spot held for them goes to the next person.
 */
export async function markWaitlistDroppedOut(db: Db, input: MarkWaitlistDroppedOutInput, now: Date) {
  const entry = await db.waitlistEntry.findUnique({
    where: { id: input.entryId },
    include: { event: { include: { group: { select: { organizerId: true } } } } },
  });

  if (!entry) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (entry.event.group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can do this." });
  }

  if (!organizerWaitlistRowActions(entry, eventRules.eventPhase(entry.event, now)).includes("MARK_DROPPED_OUT")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That isn't possible at this stage of the game." });
  }

  const dropped = await dropFromWaitlist(db, entry, now);
  await notifyUsers(db, { userIds: [entry.userId], message: notificationRules.markedDroppedOutMessage(entry.event) });

  return dropped;
}
