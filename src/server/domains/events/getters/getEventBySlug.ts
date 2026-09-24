import type { Db } from "@/server/db";
import { EventStatus, PricingMode } from "@/generated/prisma/enums";
import type { EventModel } from "@/generated/prisma/models";
// The rules file only: waitlist's index depends on events, so importing it here would be a cycle.
import { isHoldActive, sortWaitlist, spotsHeldForOthers } from "@/server/domains/waitlist/rules";
import { feeRules, getFeeScheduleById } from "@/server/domains/fees";
import { costBreakdownSchema } from "@/server/domains/events/costBreakdown";
import { countsTowardMax, hasCapacity, joinProblem, splitPriceRangeCents } from "@/server/domains/events/rules";

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
  /** Signed-in viewer, if any — used to surface their own RSVP and place on the waitlist. */
  viewerId?: string;
  /** Holds are only shown while they're running (§6). */
  now: Date;
}

/**
 * Public event view (§4): spots left, price/range, cut-off, and the list —
 * who's in, the waitlist in order (with any spot held and until when), and
 * who dropped out. No account needed to call this.
 */
export async function getEventBySlug(db: Db, slug: string, options: GetEventBySlugOptions) {
  const event = await db.event.findUnique({
    where: { slug },
    include: {
      rsvps: {
        where: { status: "GOING" },
        // Public: nothing about how anyone pays — no saved card, no pay-link secret.
        omit: { payToken: true, stripePaymentMethodId: true, cardBrand: true, cardLast4: true },
        include: { user: { select: { name: true } } },
      },
      waitlistEntries: {
        include: { user: { select: { name: true } } },
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
  // §1: members-only games say so up front. Unknown for someone signed out — the action checks again after sign-in.
  const viewerIsMember = options.viewerId
    ? (await db.groupMembership.findUnique({
        where: { groupId_userId: { groupId: event.groupId, userId: options.viewerId } },
        select: { id: true },
      })) !== null
    : null;

  // §6: first come first served; a hold only shows while it's running.
  const { now } = options;
  const waitlistEntries = sortWaitlist(event.waitlistEntries).map((entry) => ({
    id: entry.id,
    userId: entry.userId,
    user: entry.user,
    heldUntil: isHoldActive(entry, now) ? entry.heldUntil : null,
  }));
  // Place in line counts only people still waiting: a held spot shows under "In" (UI spec §4.1).
  const inLine = waitlistEntries.filter((entry) => entry.heldUntil === null);
  const viewerLineIndex = inLine.findIndex((entry) => entry.userId === options.viewerId);
  const viewerEntry = event.waitlistEntries.find((entry) => entry.userId === options.viewerId && entry.status === "WAITING");
  const going = event.rsvps.filter(countsTowardMax).length;
  const viewerWaitlist = viewerEntry
    ? {
        position: viewerLineIndex === -1 ? null : viewerLineIndex + 1,
        heldUntil: isHoldActive(viewerEntry, now) ? viewerEntry.heldUntil : null,
        // A spot nobody holds (first to claim, or everyone had their turn): anyone waiting can take it.
        spotOpen: hasCapacity(event, going + spotsHeldForOthers(event.waitlistEntries, viewerEntry.userId, now)),
      }
    : null;

  // §4 "Dropped out": people who left the game or the waitlist (walk-ins aren't shown publicly).
  const droppedRsvps = await db.rsvp.findMany({
    where: { eventId: event.id, status: "CANCELLED", userId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, user: { select: { name: true } } },
  });
  const droppedOut = [
    ...droppedRsvps.flatMap((rsvp) => (rsvp.user ? [{ id: rsvp.id, user: rsvp.user }] : [])),
    ...event.waitlistEntries.flatMap((entry) => (entry.status === "DROPPED_OUT" ? [{ id: entry.id, user: entry.user }] : [])),
  ];

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
    spotsHeld: waitlistEntries.filter((entry) => entry.heldUntil !== null).length,
    droppedOut,
    costBreakdown,
    priceDisplay: priceDisplay(event),
    viewerRsvp,
    /** So the page can highlight the viewer's own row in the list. */
    viewerId: options.viewerId ?? null,
    isOrganizer,
    viewerWaitlist,
    /** Why the viewer can't join this game (members only), or null. */
    viewerJoinProblem: viewerIsMember === null ? null : joinProblem(event, viewerIsMember),
  };
}
