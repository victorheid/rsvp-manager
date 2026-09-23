import type { Db } from "@/server/db";
import { EventStatus, PricingMode } from "@/generated/prisma/enums";
import type { EventModel } from "@/generated/prisma/models";
import { costBreakdownSchema } from "@/server/domains/events/costBreakdown";
import { splitPriceRangeCents } from "@/server/domains/events/rules";

export type PriceDisplay =
  | { mode: "fixed"; amountCents: number }
  | { mode: "range"; minCents: number | null; maxCents: number }
  | { mode: "locked"; amountCents: number };

/**
 * §2: fixed shows a flat amount; split shows a range until confirmation,
 * then the locked price forever after — never recomputed once locked.
 */
function priceDisplay(event: Pick<EventModel, "status" | "pricingMode" | "totalCostCents" | "minPlayers" | "maxPlayers" | "lockedPriceCents">): PriceDisplay {
  if (event.status === EventStatus.CONFIRMED && event.lockedPriceCents !== null) {
    return { mode: "locked", amountCents: event.lockedPriceCents };
  }

  if (event.pricingMode === PricingMode.FIXED_PER_HEAD) {
    return { mode: "fixed", amountCents: event.totalCostCents };
  }

  const range = splitPriceRangeCents(event, event.minPlayers, event.maxPlayers);
  return { mode: "range", minCents: range.minCents, maxCents: range.maxCents };
}

export interface GetEventBySlugOptions {
  /** Signed-in viewer, if any — used to surface their own RSVP. */
  viewerId?: string;
}

/**
 * Public event view (§4): spots left, price/range, cut-off, who's in.
 * No account needed to call this.
 */
export async function getEventBySlug(db: Db, slug: string, options: GetEventBySlugOptions = {}) {
  const event = await db.event.findUnique({
    where: { slug },
    include: {
      rsvps: {
        where: { status: "GOING" },
        include: { user: { select: { firstName: true, lastInitial: true } } },
      },
      group: { select: { name: true, slug: true } },
    },
  });

  if (!event) {
    return null;
  }

  // costBreakdown is a JSON column — parsed at the boundary (CLAUDE.md),
  // never trusted as already-shaped just because we wrote it ourselves.
  const costBreakdown = costBreakdownSchema.safeParse(event.costBreakdown).data ?? [];

  const viewerRsvp = options.viewerId
    ? await db.rsvp.findUnique({
        where: { eventId_userId: { eventId: event.id, userId: options.viewerId } },
      })
    : null;

  return { ...event, costBreakdown, priceDisplay: priceDisplay(event), viewerRsvp };
}
