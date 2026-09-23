import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EventStatus, PricingMode, RsvpStatus } from "@/generated/prisma/enums";
import type { CostBreakdownItem } from "@/server/domains/events/costBreakdown";
import { notifyEventAudience } from "@/server/domains/events/actions/notifyEventAudience";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { eventDetailsChanged, isDisallowedPriceIncrease, paymentOptionsProblem } from "@/server/domains/events/rules";

export interface EditEventInput {
  eventId: string;
  organizerId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  cutoffAt: Date;
  minPlayers?: number;
  maxPlayers?: number;
  totalCostCents: number;
  costBreakdown?: CostBreakdownItem[];
  pricingMode: PricingMode;
  cashAllowed?: boolean;
  onlineAllowed?: boolean;
  autoChargeAtCutoff?: boolean;
}

/**
 * Edits an event (§2, §10.4), organizer only, while it's still Open —
 * once Confirmed the price is locked and nothing else about the game
 * changes either, so there's nothing left to edit (Cancel is the only
 * lifecycle move from there). Players and the waitlist are notified when
 * something they plan around changes (§9).
 */
export async function editEvent(db: Db, input: EditEventInput) {
  const { before, after } = await db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: {
        group: { select: { organizerId: true, organizer: { select: { payoutsEnabled: true } } } },
        rsvps: { where: { status: RsvpStatus.GOING } },
      },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (event.group.organizerId !== input.organizerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can edit this event." });
    }

    if (event.status !== EventStatus.OPEN) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Event is ${event.status.toLowerCase()} — nothing left to edit.`,
      });
    }

    if (input.endsAt <= input.startsAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "End time must be after the start time." });
    }

    if (input.cutoffAt >= input.startsAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Cut-off must be before the event start time." });
    }

    if (input.maxPlayers !== undefined && input.maxPlayers < (input.minPlayers ?? 1)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Max players can't be below min players." });
    }

    const optionsProblem = paymentOptionsProblem(
      { cashAllowed: input.cashAllowed ?? false, onlineAllowed: input.onlineAllowed ?? false },
      event.group.organizer.payoutsEnabled,
    );

    if (optionsProblem) {
      throw new TRPCError({ code: "BAD_REQUEST", message: optionsProblem });
    }

    const rsvpCount = event.rsvps.length;

    if (input.pricingMode !== event.pricingMode && rsvpCount > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Pricing mode can't change once someone has RSVP'd.",
      });
    }

    if (isDisallowedPriceIncrease(event.totalCostCents, input.totalCostCents, rsvpCount)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Price can't go up once someone has RSVP'd. It can go down.",
      });
    }

    // §8: walk-ins (no userId) don't count against max.
    const headcountAgainstMax = event.rsvps.filter((rsvp) => rsvp.userId !== null).length;

    if (input.maxPlayers !== undefined && input.maxPlayers < headcountAgainstMax) {
      // §2: lowering max below headcount should move the newest RSVPs to
      // the front of the waitlist — not built yet (specs/tasks.md §6).
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Can't lower max below the current headcount (${headcountAgainstMax}) yet.`,
      });
    }

    const updated = await tx.event.update({
      where: { id: input.eventId },
      data: {
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        location: input.location,
        cutoffAt: input.cutoffAt,
        minPlayers: input.minPlayers ?? 1,
        maxPlayers: input.maxPlayers,
        totalCostCents: input.totalCostCents,
        costBreakdown: input.costBreakdown,
        pricingMode: input.pricingMode,
        cashAllowed: input.cashAllowed ?? false,
        onlineAllowed: input.onlineAllowed ?? false,
        autoChargeAtCutoff: input.autoChargeAtCutoff ?? true,
      },
    });

    return { before: event, after: updated };
  });

  if (eventDetailsChanged(before, after)) {
    await notifyEventAudience(db, {
      eventId: after.id,
      message: notificationRules.eventChangedMessage(after),
      includeWaitlist: true,
      exceptUserId: input.organizerId,
    });
  }

  // §6: a raised max opens spots — tell the notify-me waitlist (auto-join entries are moved in by the worker).
  const raisedMax = before.maxPlayers !== null && (after.maxPlayers === null || after.maxPlayers > before.maxPlayers);
  if (raisedMax) {
    const waiting = await db.waitlistEntry.findMany({ where: { eventId: after.id, promotionMode: "MANUAL" }, select: { userId: true } });
    await notifyUsers(db, { userIds: waiting.map((entry) => entry.userId), message: notificationRules.spotOpenMessage(after) });
  }

  return after;
}
