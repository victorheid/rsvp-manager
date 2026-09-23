import { formatCents } from "@/lib/format";
import { splitPriceRangeCents } from "@/server/domains/events/rules";
import type { RouterOutputs } from "@/lib/trpc/types";

type PricedEvent = Pick<
  RouterOutputs["groups"]["getBySlug"]["events"][number],
  "status" | "pricingMode" | "totalCostCents" | "minPlayers" | "maxPlayers" | "lockedPriceCents"
>;

/**
 * The price line for a game in a list: "€8.00 each", "€6.67–€10.00 each",
 * "Up to €20.00 each". A confirmed game shows its locked price, never a
 * recomputed one (§2). The range comes from the events domain's rule, so
 * rounding lives in one place.
 */
export function eventPriceText(event: PricedEvent): string {
  if (event.status === "CONFIRMED" && event.lockedPriceCents !== null) {
    return `${formatCents(event.lockedPriceCents)} each`;
  }

  if (event.pricingMode === "FIXED_PER_HEAD") {
    return `${formatCents(event.totalCostCents)} each`;
  }

  const range = splitPriceRangeCents(event, event.minPlayers, event.maxPlayers);
  return range.minCents === null
    ? `Up to ${formatCents(range.maxCents)} each`
    : `${formatCents(range.minCents)}–${formatCents(range.maxCents)} each`;
}

/** "8/12 in", or "8 in" when there's no limit. */
export function headcountText(goingCount: number, maxPlayers: number | null): string {
  return `${goingCount}${maxPlayers === null ? "" : `/${maxPlayers}`} in`;
}
