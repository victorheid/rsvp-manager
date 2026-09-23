/**
 * Display formatting shared by every screen. Money is integer cents in EUR
 * and times are UTC in the database; both are converted here, and only
 * here, for display (CLAUDE.md → "Domain conventions").
 */

/** The event's timezone. Times are stored in UTC and shown in this zone. */
export const EVENT_TIME_ZONE = "Europe/Dublin";

const LOCALE = "en-IE";

/** `800` → `"€8.00"`. Always with cents (UI spec §11). */
export function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

/** `Thu 25 Sep · 19:00` (UI spec §11) */
export function formatDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: EVENT_TIME_ZONE,
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";

  // Built from parts: the locale's own joiner adds a comma and spells
  // September "Sept", neither of which the spec's format has.
  return `${part("weekday")} ${part("day")} ${part("month").slice(0, 3)} · ${formatTime(date)}`;
}

/** `19:00` (24h clock) */
export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: EVENT_TIME_ZONE,
  }).format(date);
}

/** `Thu 25 Sep · 19:00–20:30` */
export function formatTimeRange(startsAt: Date, endsAt: Date): string {
  return `${formatDateTime(startsAt)}–${formatTime(endsAt)}`;
}

/** `in 2 days`, `tomorrow`, `today`, `2 days ago`. Pass `now` so it stays testable. */
export function formatRelativeDay(date: Date, now: Date): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((startOfDay(date) - startOfDay(now)) / dayMs);

  return new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto" }).format(days, "day");
}

function startOfDay(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: EVENT_TIME_ZONE }).format(date);
  return new Date(`${parts}T00:00:00Z`).getTime();
}

/** `Aoife M.` — the only form of a player's name other players ever see (§4). */
export function formatPlayerName(user: { firstName: string; lastInitial: string }): string {
  return `${user.firstName} ${user.lastInitial}.`;
}
