import { PricingMode } from "@/generated/prisma/enums";
import type { EventModel } from "@/generated/prisma/models";

/**
 * Business rules for events (spec §2, §3). Pure functions only: no Prisma
 * calls, no Date.now(), no I/O. Actions call these; nothing else should
 * reimplement this logic.
 */

type PricedEvent = Pick<EventModel, "pricingMode" | "totalCostCents">;

/**
 * The locked per-head price once headcount is known (at confirmation, or
 * for a fixed-price event at any time). §2 "Price lock".
 */
export function perHeadPriceCents(event: PricedEvent, headcount: number): number {
  if (headcount <= 0) {
    throw new Error("headcount must be positive");
  }

  if (event.pricingMode === PricingMode.FIXED_PER_HEAD) {
    return event.totalCostCents;
  }

  return Math.ceil(event.totalCostCents / headcount);
}

/**
 * The price range shown before confirmation for a split-evenly event: from
 * total ÷ max (full event) up to total ÷ min, or unbounded above ("up to
 * total ÷ min") if there's no max. §2 "Pricing mode".
 */
export function splitPriceRangeCents(
  event: PricedEvent,
  minPlayers: number,
  maxPlayers: number | null,
): { minCents: number | null; maxCents: number } {
  if (event.pricingMode !== PricingMode.SPLIT_EVENLY) {
    throw new Error("splitPriceRangeCents only applies to split-evenly events");
  }

  return {
    minCents: maxPlayers ? Math.ceil(event.totalCostCents / maxPlayers) : null,
    maxCents: Math.ceil(event.totalCostCents / minPlayers),
  };
}

/**
 * §2 "Editing an event after people have RSVP'd": the price can't go up
 * once anyone has RSVP'd. It can go down.
 */
export function isDisallowedPriceIncrease(
  currentTotalCostCents: number,
  nextTotalCostCents: number,
  rsvpCount: number,
): boolean {
  return rsvpCount > 0 && nextTotalCostCents > currentTotalCostCents;
}

/**
 * §3, decision 17: dropping out is always possible up to the event start,
 * confirmed or not — only the refund outcome differs (free before
 * confirmation, organizer's call after). Cancelled/expired events have
 * nothing left to drop out of.
 */
export function canSelfCancel(event: Pick<EventModel, "status" | "startsAt">, now: Date): boolean {
  if (event.status === "CANCELLED" || event.status === "EXPIRED") {
    return false;
  }

  return now < event.startsAt;
}

/**
 * §3 "At cut-off": whether the event should auto-confirm.
 */
export function shouldAutoConfirmAtCutoff(
  event: Pick<EventModel, "autoChargeAtCutoff" | "cutoffAt">,
  confirmedHeadcount: number,
  minPlayers: number,
  now: Date,
): boolean {
  return (
    event.autoChargeAtCutoff &&
    now >= event.cutoffAt &&
    confirmedHeadcount >= minPlayers
  );
}

/**
 * §7: unconfirmed events expire 48h after their start.
 */
export function isExpired(event: Pick<EventModel, "status" | "startsAt">, now: Date): boolean {
  const expiryMs = event.startsAt.getTime() + 48 * 60 * 60 * 1000;
  return event.status === "OPEN" && now.getTime() >= expiryMs;
}
