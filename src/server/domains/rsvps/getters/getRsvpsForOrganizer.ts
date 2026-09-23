import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { eventRules } from "@/server/domains/events";
import { paymentRules } from "@/server/domains/payments";
import { organizerRowActions } from "@/server/domains/rsvps/rules";

export interface GetRsvpsForOrganizerInput {
  eventId: string;
  organizerId: string;
}

/**
 * Organizer event list (§8): every RSVP for the event — going and dropped
 * out alike — with each player's no-show count for this group.
 *
 * Also says what the organizer can do *right now*: the event's phase and
 * event-level actions, and each person's allowed actions. The screen
 * renders these as given rather than re-deriving them, so "why can't I
 * remove someone?" is answered by the rules, not by UI code.
 */
export async function getRsvpsForOrganizer(db: Db, input: GetRsvpsForOrganizerInput, now: Date) {
  const event = await db.event.findUnique({
    where: { id: input.eventId },
    include: {
      group: { select: { organizerId: true, name: true } },
      rsvps: {
        // The pay-link secret and saved card belong to the player, not the organizer's list.
        omit: { payToken: true, stripePaymentMethodId: true },
        include: { user: { select: { id: true, firstName: true, lastInitial: true, phoneNumber: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (event.group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can manage this event." });
  }

  const noShowCounts = await db.rsvp.groupBy({
    by: ["userId"],
    where: { attended: false, event: { groupId: event.groupId } },
    _count: { _all: true },
  });
  const noShowByUser = new Map(noShowCounts.map((row) => [row.userId, row._count._all]));

  const refundsOpen = paymentRules.canRefundOnline(event, now);
  const hasOnlinePaid = event.rsvps.some((rsvp) => rsvp.paymentStatus === "CHARGED" && rsvp.paymentMethod !== "CASH");
  const eventActions = eventRules.organizerEventActions(event, now, {
    refundableOnlinePayments: refundsOpen && hasOnlinePaid && event.status === "CONFIRMED",
  });

  return {
    event,
    eventActions,
    rsvps: event.rsvps.map((rsvp) => ({
      ...rsvp,
      noShowCount: noShowByUser.get(rsvp.userId) ?? 0,
      actions: organizerRowActions({
        rsvp,
        phase: eventActions.phase,
        isOrganizersOwnRsvp: rsvp.userId === input.organizerId,
        refundsOpen,
      }),
    })),
  };
}
