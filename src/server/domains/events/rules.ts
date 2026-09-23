import { PricingMode } from "@/generated/prisma/enums";
import type { EventModel } from "@/generated/prisma/models";
import { EVENT_TIME_ZONE } from "@/lib/format";

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

/**
 * The organizer's view of where an event is in its life. Derived, never
 * stored: the Manage screen shows only what serves the current phase, so
 * the whole UI keys off this one value (UI spec §10.5, "one screen per
 * phase").
 *
 *   OPEN → CONFIRMED → LIVE → FINISHED   (or CANCELLED / EXPIRED)
 *
 * Payout isn't modelled yet (§5), so FINISHED is the last phase.
 */
export const EVENT_PHASES = ["OPEN", "CONFIRMED", "LIVE", "FINISHED", "CANCELLED", "EXPIRED"] as const;
export type EventPhase = (typeof EVENT_PHASES)[number];

export function eventPhase(
  event: Pick<EventModel, "status" | "startsAt" | "endsAt">,
  now: Date,
): EventPhase {
  if (event.status === "CANCELLED") return "CANCELLED";
  if (event.status === "EXPIRED") return "EXPIRED";
  if (now >= event.endsAt) return "FINISHED";
  if (now >= event.startsAt) return "LIVE";
  return event.status === "OPEN" ? "OPEN" : "CONFIRMED";
}

/** Everything the organizer can do to the event as a whole. */
export type OrganizerEventAction =
  | "SHARE"
  | "CONFIRM"
  | "EDIT"
  | "REPEAT"
  | "ADD_WALK_IN"
  | "VIEW_PUBLIC_PAGE"
  | "CANCEL";

export interface OrganizerEventActions {
  phase: EventPhase;
  /** The one thing the screen leads with. */
  primary: OrganizerEventAction;
  /** At most one supporting button next to it. */
  secondary: OrganizerEventAction | null;
  /** Everything else, in the game-options menu. Cancel is always last. */
  menu: OrganizerEventAction[];
}

/**
 * Which event-level actions exist in each phase (UI spec §10.5). Each phase
 * is deliberately minimal: e.g. nothing about attendance before the game,
 * no cancel once it's running, no share once it's over.
 *
 * While the event is still Open, "Share" leads (fill the game) and
 * "Confirm now" supports it — unless auto-charge is off or the cut-off has
 * passed, when confirming *is* the decision the organizer has to make (§3,
 * §10.9), so it leads instead.
 */
export function organizerEventActions(
  event: Pick<EventModel, "status" | "startsAt" | "endsAt" | "cutoffAt" | "autoChargeAtCutoff">,
  now: Date,
): OrganizerEventActions {
  const phase = eventPhase(event, now);

  switch (phase) {
    case "OPEN": {
      const confirmIsTheDecision = !event.autoChargeAtCutoff || now >= event.cutoffAt;
      return {
        phase,
        primary: confirmIsTheDecision ? "CONFIRM" : "SHARE",
        secondary: confirmIsTheDecision ? "SHARE" : "CONFIRM",
        menu: ["EDIT", "REPEAT", "ADD_WALK_IN", "VIEW_PUBLIC_PAGE", "CANCEL"],
      };
    }
    case "CONFIRMED":
      return { phase, primary: "SHARE", secondary: null, menu: ["REPEAT", "ADD_WALK_IN", "VIEW_PUBLIC_PAGE", "CANCEL"] };
    case "LIVE":
      return { phase, primary: "ADD_WALK_IN", secondary: null, menu: ["REPEAT", "VIEW_PUBLIC_PAGE"] };
    case "FINISHED":
    case "CANCELLED":
    case "EXPIRED":
      return { phase, primary: "REPEAT", secondary: null, menu: ["VIEW_PUBLIC_PAGE"] };
  }
}

const DEFAULT_DURATION_MS = 90 * 60 * 1000;
const DEFAULT_CUTOFF_LEAD_MS = 24 * 60 * 60 * 1000;

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function weekdayName(date: Date): string {
  return new Intl.DateTimeFormat("en-IE", { weekday: "long", timeZone: EVENT_TIME_ZONE }).format(date);
}

/**
 * UI spec §10.3: the date leads the create form and the title follows it.
 * A recurring game is nearly always "<weekday> <thing>", so: take the last
 * game's title (or the group's name) and swap in the new date's weekday.
 * "Thursday 5-a-side" on a Saturday date becomes "Saturday 5-a-side"; a
 * title with no weekday gets one put in front.
 */
export function suggestEventTitle(
  source: { groupName: string; lastTitle: string | null },
  startsAt: Date,
): string {
  const base = (source.lastTitle ?? source.groupName).trim();
  const weekday = weekdayName(startsAt);
  const leading = WEEKDAY_NAMES.find((name) => base.toLowerCase().startsWith(name.toLowerCase()));

  if (leading) {
    return `${weekday}${base.slice(leading.length)}`;
  }

  return `${weekday} ${base}`;
}

type LastEvent = Pick<
  EventModel,
  | "title"
  | "startsAt"
  | "endsAt"
  | "cutoffAt"
  | "location"
  | "minPlayers"
  | "maxPlayers"
  | "pricingMode"
  | "totalCostCents"
  | "cashAllowed"
  | "autoChargeAtCutoff"
>;

export interface SuggestedEventDefaults {
  title: string;
  endsAt: Date;
  cutoffAt: Date;
  location: string;
  minPlayers: number;
  maxPlayers: number | null;
  pricingMode: EventModel["pricingMode"];
  totalCostCents: number;
  cashAllowed: boolean;
  autoChargeAtCutoff: boolean;
  /** Title of the game the rest was copied from; null for a group's first game. */
  basedOnTitle: string | null;
}

/**
 * UI spec §10.3: once the organizer picks a date, everything else defaults
 * to "same as last game" — same length, same cut-off lead time, location,
 * player limits, price. A group's first game gets sensible blanks (90
 * minutes, cut-off 24h before start).
 */
export function suggestEventDefaults(
  input: { groupName: string; lastEvent: LastEvent | null },
  startsAt: Date,
): SuggestedEventDefaults {
  const { groupName, lastEvent } = input;
  const durationMs = lastEvent ? lastEvent.endsAt.getTime() - lastEvent.startsAt.getTime() : DEFAULT_DURATION_MS;
  const leadMs = lastEvent ? lastEvent.startsAt.getTime() - lastEvent.cutoffAt.getTime() : DEFAULT_CUTOFF_LEAD_MS;

  return {
    title: suggestEventTitle({ groupName, lastTitle: lastEvent?.title ?? null }, startsAt),
    endsAt: new Date(startsAt.getTime() + (durationMs > 0 ? durationMs : DEFAULT_DURATION_MS)),
    cutoffAt: new Date(startsAt.getTime() - (leadMs > 0 ? leadMs : DEFAULT_CUTOFF_LEAD_MS)),
    location: lastEvent?.location ?? "",
    minPlayers: lastEvent?.minPlayers ?? 1,
    maxPlayers: lastEvent?.maxPlayers ?? null,
    pricingMode: lastEvent?.pricingMode ?? PricingMode.FIXED_PER_HEAD,
    totalCostCents: lastEvent?.totalCostCents ?? 0,
    cashAllowed: lastEvent?.cashAllowed ?? true,
    autoChargeAtCutoff: lastEvent?.autoChargeAtCutoff ?? true,
    basedOnTitle: lastEvent?.title ?? null,
  };
}

/**
 * §9 "Event details changed": whether an edit is worth a notification. Only
 * what a player plans around counts — description and cost-breakdown
 * tweaks, or the auto-charge toggle, don't ping anyone.
 */
export function eventDetailsChanged(
  before: Pick<EventModel, "title" | "startsAt" | "endsAt" | "location" | "cutoffAt" | "totalCostCents">,
  after: Pick<EventModel, "title" | "startsAt" | "endsAt" | "location" | "cutoffAt" | "totalCostCents">,
): boolean {
  return (
    before.title !== after.title ||
    before.startsAt.getTime() !== after.startsAt.getTime() ||
    before.endsAt.getTime() !== after.endsAt.getTime() ||
    before.location !== after.location ||
    before.cutoffAt.getTime() !== after.cutoffAt.getTime() ||
    before.totalCostCents !== after.totalCostCents
  );
}

/** §9: the cut-off reminder goes out this long before the cut-off. */
export const CUTOFF_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;

/**
 * §9 "Cut-off reminder (e.g. 24h before)": due once an open event is within
 * 24h of its cut-off, and not already sent. An event posted inside that
 * window never gets one — everyone was just told about it, and a reminder
 * minutes later is noise.
 */
export function isCutoffReminderDue(
  event: Pick<EventModel, "status" | "cutoffAt" | "createdAt" | "cutoffReminderSentAt">,
  now: Date,
): boolean {
  const windowStart = event.cutoffAt.getTime() - CUTOFF_REMINDER_LEAD_MS;

  return (
    event.status === "OPEN" &&
    event.cutoffReminderSentAt === null &&
    now.getTime() >= windowStart &&
    now < event.cutoffAt &&
    event.createdAt.getTime() <= windowStart
  );
}

/**
 * §9 "Cut-off passed without min met, or auto-charge off": whether the
 * organizer should be alerted that the game is still unconfirmed and needs
 * a decision (§10.9 of the UI spec). Once per event, and never when the
 * cut-off job is about to confirm it itself.
 */
export function needsOrganizerCutoffAlert(
  event: Pick<EventModel, "status" | "autoChargeAtCutoff" | "cutoffAt" | "minPlayers" | "organizerAlertedAt">,
  confirmedHeadcount: number,
  now: Date,
): boolean {
  return (
    event.status === "OPEN" &&
    event.organizerAlertedAt === null &&
    now >= event.cutoffAt &&
    !shouldAutoConfirmAtCutoff(event, confirmedHeadcount, event.minPlayers, now)
  );
}
