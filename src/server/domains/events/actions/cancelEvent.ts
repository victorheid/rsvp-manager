import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";
import { refundEventPayments } from "@/server/domains/payments";
import { releaseHolds } from "@/server/domains/wallet";
import type { PaymentGateway } from "@/server/integrations/stripe";
import { notifyEventAudience } from "@/server/domains/events/actions/notifyEventAudience";
import { notificationRules } from "@/server/domains/notifications";

export interface CancelEventInput {
  eventId: string;
  organizerId: string;
}

/**
 * Cancels an event (§7), organizer only, at any point before it starts.
 * Online payments are refunded in full including the service fee (§5), and
 * wallet holds are released; cash payers are just notified.
 */
export async function cancelEvent(db: Db, gateway: PaymentGateway, input: CancelEventInput, now: Date = new Date()) {
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

  const cancelled = await db.$transaction(async (tx) => {
    const updated = await tx.event.update({
      where: { id: input.eventId },
      data: { status: EventStatus.CANCELLED },
    });

    // §7: holds are released, and saved cards are simply never charged.
    const rsvps = await tx.rsvp.findMany({ where: { eventId: input.eventId }, select: { id: true } });
    await releaseHolds(tx, { rsvpIds: rsvps.map((rsvp) => rsvp.id) }, now);

    return updated;
  });

  // §5, §7: everything already paid online goes back in full, service fee included.
  await refundEventPayments(db, gateway, { eventId: input.eventId });

  await notifyEventAudience(db, {
    eventId: input.eventId,
    message: notificationRules.eventCancelledMessage(cancelled),
    includeWaitlist: true,
    exceptUserId: input.organizerId,
  });

  return cancelled;
}
