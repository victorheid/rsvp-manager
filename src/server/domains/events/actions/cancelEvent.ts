import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";
import { notifyEventAudience } from "@/server/domains/events/actions/notifyEventAudience";
import { notificationRules } from "@/server/domains/notifications";

export interface CancelEventInput {
  eventId: string;
  organizerId: string;
}

/**
 * Cancels an event (§7), organizer only, at any point before it starts.
 * §5: online payments would be refunded in full including the service
 * fee — not needed yet since no online payments exist (§5 isn't built).
 * Cash payers are just notified.
 */
export async function cancelEvent(db: Db, input: CancelEventInput) {
  const event = await db.event.findUnique({
    where: { id: input.eventId },
    include: { group: { select: { organizerId: true } } },
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (event.group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can cancel this event." });
  }

  if (event.status === EventStatus.CANCELLED || event.status === EventStatus.EXPIRED) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Event is already ${event.status.toLowerCase()}.` });
  }

  const cancelled = await db.event.update({
    where: { id: input.eventId },
    data: { status: EventStatus.CANCELLED },
  });

  await notifyEventAudience(db, {
    eventId: input.eventId,
    message: notificationRules.eventCancelledMessage(cancelled),
    includeWaitlist: true,
    exceptUserId: input.organizerId,
  });

  return cancelled;
}
