import type { Db } from "@/server/db";
import { EventStatus, PricingMode } from "@/generated/prisma/enums";
import type { EventModel } from "@/generated/prisma/models";
// The rules file only: waitlist's index depends on events, so importing it here would be a cycle.
import { sortWaitlist } from "@/server/domains/waitlist/rules";
import { feeRules, getFeeScheduleById } from "@/server/domains/fees";
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
        // Public: nothing about how anyone pays — no saved card, no pay-link secret.
        omit: { payToken: true, stripePaymentMethodId: true, cardBrand: true, cardLast4: true },
        include: { user: { select: { firstName: true, lastInitial: true } } },
      },
      waitlistEntries: {
        orderBy: { createdAt: "asc" },
        omit: { stripePaymentMethodId: true, cardBrand: true, cardLast4: true },
        include: { user: { select: { firstName: true, lastInitial: true } } },
      },
      group: { select: { name: true, slug: true, organizerId: true } },
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
        // The viewer's own row keeps its pay link (they may owe), but never the provider's card id.
        omit: { stripePaymentMethodId: true },
      })
    : null;

  const isOrganizer = options.viewerId !== undefined && options.viewerId === event.group.organizerId;

  // §6: auto-join entries come first, then notify-me, each by join time.
  const waitlistEntries = sortWaitlist(event.waitlistEntries);
  const viewerWaitlistPosition = options.viewerId
    ? waitlistEntries.findIndex((entry) => entry.userId === options.viewerId)
    : -1;

  // §5: the service fee a card payment adds, from the schedule pinned at creation — on the locked
  // price once there is one, else on the most it could be. Wallet and cash carry no fee.
  const display = priceDisplay(event);
  const quotedPriceCents = display.mode === "range" ? display.maxCents : display.amountCents;
  const schedule = await getFeeScheduleById(db, event.feeScheduleId);
  const cardFeeCents = feeRules.feeForAmountCents(schedule.gameCardFeeTiers, quotedPriceCents);

  return {
    ...event,
    cardFeeCents,
    waitlistEntries,
    costBreakdown,
    priceDisplay: priceDisplay(event),
    viewerRsvp,
    isOrganizer,
    viewerWaitlistPosition: viewerWaitlistPosition === -1 ? null : viewerWaitlistPosition + 1,
    viewerWaitlistMode: waitlistEntries[viewerWaitlistPosition]?.promotionMode ?? null,
  };
}
