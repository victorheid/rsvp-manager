import type { RouterInputs, RouterOutputs } from "@/lib/trpc/types";

/**
 * The create/edit-event form's state, and the conversions between it and
 * the API. The date leads the form (UI spec §10.3): date, start and end
 * time are separate inputs, and end rolls to the next day when it's not
 * after the start. Times are entered and shown in the browser's local time.
 */
type CreateEventInput = RouterInputs["events"]["create"];

export interface EventFormValues {
  title: string;
  description: string;
  /** `YYYY-MM-DD` */
  date: string;
  /** `HH:mm` */
  startTime: string;
  /** `HH:mm` */
  endTime: string;
  location: string;
  /** `YYYY-MM-DDTHH:mm` (datetime-local) */
  cutoff: string;
  minPlayers: number;
  noMax: boolean;
  maxPlayers: number;
  pricingMode: CreateEventInput["pricingMode"];
  totalCostEuros: string;
  cashAllowed: boolean;
  onlineAllowed: boolean;
  autoChargeAtCutoff: boolean;
}

export const EMPTY_EVENT_FORM_VALUES: EventFormValues = {
  title: "",
  description: "",
  date: "",
  startTime: "19:00",
  endTime: "20:30",
  location: "",
  cutoff: "",
  minPlayers: 1,
  noMax: true,
  maxPlayers: 10,
  pricingMode: "FIXED_PER_HEAD",
  totalCostEuros: "",
  cashAllowed: true,
  onlineAllowed: false,
  autoChargeAtCutoff: true,
};

const pad = (n: number) => n.toString().padStart(2, "0");

/** `YYYY-MM-DD` in the browser's local time, for `<input type="date">`. */
export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `HH:mm` in the browser's local time, for `<input type="time">`. */
export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** `YYYY-MM-DDTHH:mm` in the browser's local time, for `<input type="datetime-local">`. */
export function toDatetimeLocalInput(date: Date): string {
  return `${toDateInput(date)}T${toTimeInput(date)}`;
}

type SourceEvent = Pick<
  RouterOutputs["events"]["getBySlug"],
  | "title"
  | "description"
  | "startsAt"
  | "endsAt"
  | "location"
  | "cutoffAt"
  | "minPlayers"
  | "maxPlayers"
  | "pricingMode"
  | "totalCostCents"
  | "cashAllowed"
  | "onlineAllowed"
  | "autoChargeAtCutoff"
>;

/** Form values from an existing event, optionally moved later by `shiftMs` ("Repeat this game" uses +7 days). */
export function eventFormValuesFromEvent(event: SourceEvent, shiftMs = 0): EventFormValues {
  const startsAt = new Date(new Date(event.startsAt).getTime() + shiftMs);
  const endsAt = new Date(new Date(event.endsAt).getTime() + shiftMs);
  const cutoffAt = new Date(new Date(event.cutoffAt).getTime() + shiftMs);

  return {
    title: event.title,
    description: event.description ?? "",
    date: toDateInput(startsAt),
    startTime: toTimeInput(startsAt),
    endTime: toTimeInput(endsAt),
    location: event.location,
    cutoff: toDatetimeLocalInput(cutoffAt),
    minPlayers: event.minPlayers,
    noMax: event.maxPlayers === null,
    maxPlayers: event.maxPlayers ?? 10,
    pricingMode: event.pricingMode,
    totalCostEuros: (event.totalCostCents / 100).toString(),
    cashAllowed: event.cashAllowed,
    onlineAllowed: event.onlineAllowed,
    autoChargeAtCutoff: event.autoChargeAtCutoff,
  };
}

/** When the game starts, or `null` while the date or time isn't filled in yet. */
export function startsAtFromValues(values: Pick<EventFormValues, "date" | "startTime">): Date | null {
  if (!values.date || !values.startTime) return null;
  const startsAt = new Date(`${values.date}T${values.startTime}`);
  return Number.isNaN(startsAt.getTime()) ? null : startsAt;
}

/** The API input for create/edit, minus the ids the caller adds. Ends the next day if the end time isn't after the start. */
export function eventFormToInput(values: EventFormValues): Omit<CreateEventInput, "groupId"> {
  const startsAt = new Date(`${values.date}T${values.startTime}`);
  const sameDayEnd = new Date(`${values.date}T${values.endTime}`);
  const endsAt = sameDayEnd > startsAt ? sameDayEnd : new Date(sameDayEnd.getTime() + 24 * 60 * 60 * 1000);

  return {
    title: values.title,
    description: values.description || undefined,
    startsAt,
    endsAt,
    location: values.location,
    cutoffAt: new Date(values.cutoff),
    minPlayers: values.minPlayers,
    maxPlayers: values.noMax ? undefined : values.maxPlayers,
    totalCostCents: Math.round(Number(values.totalCostEuros) * 100),
    pricingMode: values.pricingMode,
    cashAllowed: values.cashAllowed,
    onlineAllowed: values.onlineAllowed,
    autoChargeAtCutoff: values.autoChargeAtCutoff,
  };
}

/**
 * The date a recurring game most likely happens next: the last game's
 * date moved forward a week at a time until it's in the future. Uses local
 * calendar days (not 7×24h) so a game at 19:00 stays at 19:00 across a
 * daylight-saving change.
 */
export function nextWeeklyStart(lastStartsAt: Date, now: Date): Date {
  const next = new Date(lastStartsAt);
  do {
    next.setDate(next.getDate() + 7);
  } while (next <= now);
  return next;
}

/**
 * What the organizer has typed, layered over defaults. The form's values
 * are *derived* — defaults (the last game, the suggestion for the chosen
 * date) with the organizer's own edits on top — instead of being copied
 * into state by effects. That's what makes "change the date and untouched
 * fields follow it" work without ever overwriting something they typed.
 */
export interface EventFormEdits {
  values: EventFormValues;
  /** The fields the organizer has changed themselves. Only these win over the defaults. */
  touched: ReadonlySet<keyof EventFormValues>;
}

export const NO_EDITS: EventFormEdits = { values: EMPTY_EVENT_FORM_VALUES, touched: new Set() };

/** Records that `changed` was edited; `next` is the whole form as it now stands. */
export function recordEdit(edits: EventFormEdits, next: EventFormValues, changed: keyof EventFormValues): EventFormEdits {
  return { values: next, touched: new Set(edits.touched).add(changed) };
}

/** The organizer's edits over `base`: touched fields from the edits, everything else from the defaults. */
export function applyEdits(base: EventFormValues, edits: EventFormEdits): EventFormValues {
  const pick = <K extends keyof EventFormValues>(key: K): EventFormValues[K] =>
    edits.touched.has(key) ? edits.values[key] : base[key];

  return {
    title: pick("title"),
    description: pick("description"),
    date: pick("date"),
    startTime: pick("startTime"),
    endTime: pick("endTime"),
    location: pick("location"),
    cutoff: pick("cutoff"),
    minPlayers: pick("minPlayers"),
    noMax: pick("noMax"),
    maxPlayers: pick("maxPlayers"),
    pricingMode: pick("pricingMode"),
    totalCostEuros: pick("totalCostEuros"),
    cashAllowed: pick("cashAllowed"),
    onlineAllowed: pick("onlineAllowed"),
    autoChargeAtCutoff: pick("autoChargeAtCutoff"),
  };
}

/** The defaults `events.suggestDefaults` proposes for a chosen date, as form values. */
export function eventFormValuesFromSuggestion(
  base: EventFormValues,
  suggestion: RouterOutputs["events"]["suggestDefaults"],
): EventFormValues {
  return {
    ...base,
    title: suggestion.title,
    endTime: toTimeInput(new Date(suggestion.endsAt)),
    location: suggestion.location,
    cutoff: toDatetimeLocalInput(new Date(suggestion.cutoffAt)),
    minPlayers: suggestion.minPlayers,
    noMax: suggestion.maxPlayers === null,
    maxPlayers: suggestion.maxPlayers ?? base.maxPlayers,
    pricingMode: suggestion.pricingMode,
    // A group's first game has no price to copy; leave the field empty rather than showing "0".
    totalCostEuros: suggestion.totalCostCents > 0 ? (suggestion.totalCostCents / 100).toString() : "",
    cashAllowed: suggestion.cashAllowed,
    onlineAllowed: suggestion.onlineAllowed,
    autoChargeAtCutoff: suggestion.autoChargeAtCutoff,
  };
}
