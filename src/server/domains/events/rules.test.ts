import { describe, expect, it } from "vitest";
import { PricingMode, EventStatus } from "@/generated/prisma/enums";
import {
  canSelfCancel,
  eventDetailsChanged,
  hasCapacity,
  eventPhase,
  isCutoffReminderDue,
  needsOrganizerCutoffAlert,
  paymentOptionsProblem,
  isDisallowedPriceIncrease,
  isExpired,
  organizerEventActions,
  perHeadPriceCents,
  shouldAutoConfirmAtCutoff,
  splitPriceRangeCents,
  suggestEventDefaults,
  suggestEventTitle,
} from "./rules";

describe("perHeadPriceCents", () => {
  it("returns the flat amount for fixed pricing regardless of headcount", () => {
    const event = { pricingMode: PricingMode.FIXED_PER_HEAD, totalCostCents: 1000 };
    expect(perHeadPriceCents(event, 4)).toBe(1000);
    expect(perHeadPriceCents(event, 1)).toBe(1000);
  });

  it("divides evenly and rounds up for split pricing", () => {
    const event = { pricingMode: PricingMode.SPLIT_EVENLY, totalCostCents: 1000 };
    expect(perHeadPriceCents(event, 3)).toBe(334); // 1000 / 3 = 333.33 -> 334
    expect(perHeadPriceCents(event, 4)).toBe(250);
  });

  it("rejects a non-positive headcount", () => {
    const event = { pricingMode: PricingMode.FIXED_PER_HEAD, totalCostCents: 1000 };
    expect(() => perHeadPriceCents(event, 0)).toThrow();
  });
});

describe("splitPriceRangeCents", () => {
  it("ranges from total/max to total/min when a max is set", () => {
    const event = { pricingMode: PricingMode.SPLIT_EVENLY, totalCostCents: 1200 };
    expect(splitPriceRangeCents(event, 4, 6)).toEqual({ minCents: 200, maxCents: 300 });
  });

  it("has no lower bound when there's no max", () => {
    const event = { pricingMode: PricingMode.SPLIT_EVENLY, totalCostCents: 1200 };
    expect(splitPriceRangeCents(event, 4, null)).toEqual({ minCents: null, maxCents: 300 });
  });

  it("refuses to compute a range for fixed pricing", () => {
    const event = { pricingMode: PricingMode.FIXED_PER_HEAD, totalCostCents: 1200 };
    expect(() => splitPriceRangeCents(event, 4, 6)).toThrow();
  });
});

describe("isDisallowedPriceIncrease", () => {
  it("blocks an increase once someone has RSVP'd", () => {
    expect(isDisallowedPriceIncrease(1000, 1200, 1)).toBe(true);
  });

  it("allows an increase with zero RSVPs", () => {
    expect(isDisallowedPriceIncrease(1000, 1200, 0)).toBe(false);
  });

  it("always allows a decrease", () => {
    expect(isDisallowedPriceIncrease(1000, 800, 5)).toBe(false);
  });
});

describe("canSelfCancel", () => {
  const startsAt = new Date("2026-01-10T19:00:00Z");
  const beforeStart = new Date("2026-01-10T18:00:00Z");
  const afterStart = new Date("2026-01-10T20:00:00Z");

  it("allows self-cancel while open, up to the start time", () => {
    expect(canSelfCancel({ status: EventStatus.OPEN, startsAt }, beforeStart)).toBe(true);
  });

  it("still allows self-cancel once confirmed, up to the start time", () => {
    expect(canSelfCancel({ status: EventStatus.CONFIRMED, startsAt }, beforeStart)).toBe(true);
  });

  it("blocks self-cancel once the event has started", () => {
    expect(canSelfCancel({ status: EventStatus.CONFIRMED, startsAt }, afterStart)).toBe(false);
  });

  it("blocks self-cancel once cancelled or expired", () => {
    expect(canSelfCancel({ status: EventStatus.CANCELLED, startsAt }, beforeStart)).toBe(false);
    expect(canSelfCancel({ status: EventStatus.EXPIRED, startsAt }, beforeStart)).toBe(false);
  });
});

describe("shouldAutoConfirmAtCutoff", () => {
  const cutoffAt = new Date("2026-01-10T18:00:00Z");

  it("confirms once cut-off has passed and min is met", () => {
    const event = { autoChargeAtCutoff: true, cutoffAt };
    const now = new Date("2026-01-10T18:00:01Z");
    expect(shouldAutoConfirmAtCutoff(event, 5, 4, now)).toBe(true);
  });

  it("does not confirm before cut-off", () => {
    const event = { autoChargeAtCutoff: true, cutoffAt };
    const now = new Date("2026-01-10T17:59:00Z");
    expect(shouldAutoConfirmAtCutoff(event, 5, 4, now)).toBe(false);
  });

  it("does not confirm if min isn't met", () => {
    const event = { autoChargeAtCutoff: true, cutoffAt };
    const now = new Date("2026-01-10T18:00:01Z");
    expect(shouldAutoConfirmAtCutoff(event, 2, 4, now)).toBe(false);
  });

  it("does not confirm if auto-charge is off", () => {
    const event = { autoChargeAtCutoff: false, cutoffAt };
    const now = new Date("2026-01-10T18:00:01Z");
    expect(shouldAutoConfirmAtCutoff(event, 5, 4, now)).toBe(false);
  });
});

describe("isExpired", () => {
  const startsAt = new Date("2026-01-10T18:00:00Z");

  it("expires an open event 48h after start", () => {
    const now = new Date("2026-01-12T18:00:01Z");
    expect(isExpired({ status: EventStatus.OPEN, startsAt }, now)).toBe(true);
  });

  it("does not expire before the 48h window is up", () => {
    const now = new Date("2026-01-12T17:59:00Z");
    expect(isExpired({ status: EventStatus.OPEN, startsAt }, now)).toBe(false);
  });

  it("never expires a confirmed event", () => {
    const now = new Date("2026-01-20T00:00:00Z");
    expect(isExpired({ status: EventStatus.CONFIRMED, startsAt }, now)).toBe(false);
  });
});

describe("eventPhase", () => {
  const startsAt = new Date("2026-09-25T18:00:00Z");
  const endsAt = new Date("2026-09-25T19:30:00Z");
  const before = new Date("2026-09-24T12:00:00Z");
  const during = new Date("2026-09-25T18:30:00Z");
  const after = new Date("2026-09-25T20:00:00Z");

  it.each([
    ["OPEN", before, "OPEN"],
    ["CONFIRMED", before, "CONFIRMED"],
    ["CONFIRMED", during, "LIVE"],
    ["OPEN", during, "LIVE"],
    ["CONFIRMED", after, "FINISHED"],
    ["OPEN", after, "FINISHED"],
    ["CANCELLED", before, "CANCELLED"],
    ["CANCELLED", after, "CANCELLED"],
    ["EXPIRED", after, "EXPIRED"],
  ] as const)("%s event at %s is %s", (status, now, expected) => {
    expect(eventPhase({ status, startsAt, endsAt }, now)).toBe(expected);
  });

  it("switches to live exactly at the start and finished exactly at the end", () => {
    expect(eventPhase({ status: "CONFIRMED", startsAt, endsAt }, startsAt)).toBe("LIVE");
    expect(eventPhase({ status: "CONFIRMED", startsAt, endsAt }, endsAt)).toBe("FINISHED");
  });
});

describe("organizerEventActions", () => {
  const base = {
    startsAt: new Date("2026-09-25T18:00:00Z"),
    endsAt: new Date("2026-09-25T19:30:00Z"),
    cutoffAt: new Date("2026-09-24T18:00:00Z"),
    autoChargeAtCutoff: true,
  };
  const beforeCutoff = new Date("2026-09-23T12:00:00Z");
  const afterCutoff = new Date("2026-09-24T19:00:00Z");
  const live = new Date("2026-09-25T18:30:00Z");
  const over = new Date("2026-09-25T21:00:00Z");

  it("leads with Share while open and before the cut-off, with Confirm as the supporting action", () => {
    const actions = organizerEventActions({ ...base, status: "OPEN" }, beforeCutoff);
    expect(actions.primary).toBe("SHARE");
    expect(actions.secondary).toBe("CONFIRM");
    expect(actions.menu).toEqual(["EDIT", "REPEAT", "ADD_WALK_IN", "VIEW_PUBLIC_PAGE", "CANCEL"]);
  });

  it("leads with Confirm once the cut-off has passed and the event is still open", () => {
    const actions = organizerEventActions({ ...base, status: "OPEN" }, afterCutoff);
    expect(actions.primary).toBe("CONFIRM");
    expect(actions.secondary).toBe("SHARE");
  });

  it("leads with Confirm from the start when auto-charge is off", () => {
    const actions = organizerEventActions({ ...base, status: "OPEN", autoChargeAtCutoff: false }, beforeCutoff);
    expect(actions.primary).toBe("CONFIRM");
  });

  it("no longer offers Confirm or Edit once confirmed, but still Share and Cancel", () => {
    const actions = organizerEventActions({ ...base, status: "CONFIRMED" }, beforeCutoff);
    expect(actions.primary).toBe("SHARE");
    expect(actions.secondary).toBeNull();
    expect(actions.menu).not.toContain("EDIT");
    expect(actions.menu).toContain("CANCEL");
  });

  it("leads with Add walk-in while the game is running, with no Cancel or Share", () => {
    const actions = organizerEventActions({ ...base, status: "CONFIRMED" }, live);
    expect(actions.primary).toBe("ADD_WALK_IN");
    expect(actions.menu).not.toContain("CANCEL");
    expect(actions.menu).not.toContain("SHARE");
  });

  it.each([
    ["CONFIRMED", over],
    ["CANCELLED", beforeCutoff],
    ["EXPIRED", over],
  ] as const)("leads with Repeat once a %s event is over", (status, now) => {
    const actions = organizerEventActions({ ...base, status }, now);
    expect(actions.primary).toBe("REPEAT");
    expect(actions.menu).toEqual(["VIEW_PUBLIC_PAGE"]);
  });
});

describe("suggestEventTitle", () => {
  const saturday = new Date("2026-09-26T18:00:00Z");
  const thursday = new Date("2026-09-24T18:00:00Z");

  it("swaps the weekday in the last game's title for the new date's", () => {
    expect(suggestEventTitle({ groupName: "Westside 5-a-side", lastTitle: "Thursday 5-a-side" }, saturday)).toBe(
      "Saturday 5-a-side",
    );
  });

  it("keeps the weekday when the date is on the same day", () => {
    expect(suggestEventTitle({ groupName: "Westside", lastTitle: "Thursday 5-a-side" }, thursday)).toBe(
      "Thursday 5-a-side",
    );
  });

  it("puts the weekday in front of a title that has none", () => {
    expect(suggestEventTitle({ groupName: "Westside", lastTitle: "Padel doubles" }, saturday)).toBe(
      "Saturday Padel doubles",
    );
  });

  it("falls back to the group name for a group's first game", () => {
    expect(suggestEventTitle({ groupName: "Westside 5-a-side", lastTitle: null }, thursday)).toBe(
      "Thursday Westside 5-a-side",
    );
  });

  it("names the weekday in the event's timezone, not UTC", () => {
    // 23:30 UTC on a Thursday in September is 00:30 Friday in Dublin (UTC+1).
    const lateThursdayUtc = new Date("2026-09-24T23:30:00Z");
    expect(suggestEventTitle({ groupName: "Westside", lastTitle: "Thursday 5-a-side" }, lateThursdayUtc)).toBe(
      "Friday 5-a-side",
    );
  });
});

describe("suggestEventDefaults", () => {
  const lastEvent = {
    title: "Thursday 5-a-side",
    startsAt: new Date("2026-09-17T18:00:00Z"),
    endsAt: new Date("2026-09-17T19:30:00Z"),
    cutoffAt: new Date("2026-09-16T12:00:00Z"),
    location: "Westside Sports Hall",
    minPlayers: 6,
    maxPlayers: 12,
    pricingMode: PricingMode.SPLIT_EVENLY,
    totalCostCents: 8000,
    cashAllowed: true,
    onlineAllowed: false,
    autoChargeAtCutoff: true,
    waitlistMode: "FIRST_TO_CLAIM" as const,
    waitlistHoldMinutes: 120,
  };
  const nextStart = new Date("2026-09-24T18:00:00Z");

  it("re-anchors length and cut-off lead time from the last game to the new date", () => {
    const defaults = suggestEventDefaults({ groupName: "Westside", lastEvent }, nextStart);
    expect(defaults.endsAt).toEqual(new Date("2026-09-24T19:30:00Z"));
    expect(defaults.cutoffAt).toEqual(new Date("2026-09-23T12:00:00Z"));
  });

  it("copies location, limits and price from the last game", () => {
    const defaults = suggestEventDefaults({ groupName: "Westside", lastEvent }, nextStart);
    expect(defaults).toMatchObject({
      location: "Westside Sports Hall",
      minPlayers: 6,
      maxPlayers: 12,
      pricingMode: PricingMode.SPLIT_EVENLY,
      totalCostCents: 8000,
      waitlistMode: "FIRST_TO_CLAIM",
      waitlistHoldMinutes: 120,
      basedOnTitle: "Thursday 5-a-side",
    });
  });

  it("uses 90 minutes and a 24h cut-off for a group's first game", () => {
    const defaults = suggestEventDefaults({ groupName: "Westside", lastEvent: null }, nextStart);
    expect(defaults.endsAt).toEqual(new Date("2026-09-24T19:30:00Z"));
    expect(defaults.cutoffAt).toEqual(new Date("2026-09-23T18:00:00Z"));
    expect(defaults.basedOnTitle).toBeNull();
    expect(defaults).toMatchObject({ waitlistMode: "IN_ORDER", waitlistHoldMinutes: 60 }); // §6 defaults
    expect(defaults.location).toBe("");
  });
});

describe("eventDetailsChanged", () => {
  const before = {
    title: "Friday game",
    startsAt: new Date("2026-10-02T18:00:00Z"),
    endsAt: new Date("2026-10-02T19:00:00Z"),
    location: "Court 1",
    cutoffAt: new Date("2026-10-01T18:00:00Z"),
    totalCostCents: 800,
  };

  it("is false when nothing a player plans around moved", () => {
    expect(eventDetailsChanged(before, { ...before, startsAt: new Date(before.startsAt) })).toBe(false);
  });

  it.each([
    ["title", { title: "Saturday game" }],
    ["start", { startsAt: new Date("2026-10-02T19:00:00Z") }],
    ["end", { endsAt: new Date("2026-10-02T20:00:00Z") }],
    ["location", { location: "Court 2" }],
    ["cut-off", { cutoffAt: new Date("2026-10-01T12:00:00Z") }],
    ["price", { totalCostCents: 700 }],
  ])("is true when the %s changes", (_field, change) => {
    expect(eventDetailsChanged(before, { ...before, ...change })).toBe(true);
  });
});

describe("isCutoffReminderDue", () => {
  const cutoffAt = new Date("2026-10-01T18:00:00Z");
  const event = {
    status: EventStatus.OPEN,
    cutoffAt,
    createdAt: new Date("2026-09-20T12:00:00Z"),
    cutoffReminderSentAt: null,
  };

  it("is not due more than 24h before the cut-off", () => {
    expect(isCutoffReminderDue(event, new Date("2026-09-30T17:59:59Z"))).toBe(false);
  });

  it("is due from 24h before the cut-off until the cut-off", () => {
    expect(isCutoffReminderDue(event, new Date("2026-09-30T18:00:00Z"))).toBe(true);
    expect(isCutoffReminderDue(event, new Date("2026-10-01T17:59:59Z"))).toBe(true);
  });

  it("is not due at or after the cut-off", () => {
    expect(isCutoffReminderDue(event, cutoffAt)).toBe(false);
  });

  it("is not due twice", () => {
    expect(isCutoffReminderDue({ ...event, cutoffReminderSentAt: new Date("2026-09-30T18:01:00Z") }, new Date("2026-10-01T10:00:00Z"))).toBe(false);
  });

  it("is not due once the event is confirmed or cancelled", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(isCutoffReminderDue({ ...event, status: EventStatus.CONFIRMED }, now)).toBe(false);
    expect(isCutoffReminderDue({ ...event, status: EventStatus.CANCELLED }, now)).toBe(false);
  });

  it("is skipped for an event posted inside the 24h window", () => {
    const now = new Date("2026-10-01T10:00:00Z");
    expect(isCutoffReminderDue({ ...event, createdAt: new Date("2026-09-30T20:00:00Z") }, now)).toBe(false);
  });
});

describe("needsOrganizerCutoffAlert", () => {
  const cutoffAt = new Date("2026-10-01T18:00:00Z");
  const after = new Date("2026-10-01T18:00:01Z");
  const event = { status: EventStatus.OPEN, autoChargeAtCutoff: true, cutoffAt, minPlayers: 4, organizerAlertedAt: null };

  it("alerts when the cut-off passed and the minimum wasn't met", () => {
    expect(needsOrganizerCutoffAlert(event, 3, after)).toBe(true);
  });

  it("alerts when auto-charge is off, even with the minimum met", () => {
    expect(needsOrganizerCutoffAlert({ ...event, autoChargeAtCutoff: false }, 6, after)).toBe(true);
  });

  it("stays quiet when the cut-off job will confirm the game itself", () => {
    expect(needsOrganizerCutoffAlert(event, 4, after)).toBe(false);
  });

  it("stays quiet before the cut-off", () => {
    expect(needsOrganizerCutoffAlert(event, 0, new Date("2026-10-01T17:59:59Z"))).toBe(false);
  });

  it("alerts only once, and only while open", () => {
    expect(needsOrganizerCutoffAlert({ ...event, organizerAlertedAt: after }, 3, after)).toBe(false);
    expect(needsOrganizerCutoffAlert({ ...event, status: EventStatus.CONFIRMED }, 3, after)).toBe(false);
  });
});

describe("paymentOptionsProblem", () => {
  it.each([
    [{ cashAllowed: true, onlineAllowed: false }, false, null],
    [{ cashAllowed: false, onlineAllowed: true }, true, null],
    [{ cashAllowed: true, onlineAllowed: true }, true, null],
    [{ cashAllowed: false, onlineAllowed: false }, true, "Choose at least one way to pay: cash, online, or both."],
    [{ cashAllowed: true, onlineAllowed: true }, false, "Finish payout setup before accepting online payments."],
    [{ cashAllowed: false, onlineAllowed: true }, false, "Finish payout setup before accepting online payments."],
  ])("%j with payouts enabled %s → %s", (options, payoutsEnabled, expected) => {
    expect(paymentOptionsProblem(options, payoutsEnabled)).toBe(expected);
  });
});

describe("organizerEventActions: refund all", () => {
  const confirmed = {
    status: EventStatus.CONFIRMED,
    startsAt: new Date("2026-10-02T18:00:00Z"),
    endsAt: new Date("2026-10-02T19:00:00Z"),
    cutoffAt: new Date("2026-10-01T18:00:00Z"),
    autoChargeAtCutoff: true,
  };

  it("is offered once the game is confirmed and something is refundable, before Cancel", () => {
    const menu = organizerEventActions(confirmed, new Date("2026-10-01T20:00:00Z"), { refundableOnlinePayments: true }).menu;

    expect(menu).toContain("REFUND_ALL");
    expect(menu[menu.length - 1]).toBe("CANCEL");
  });

  it("is offered while live and after the game, but never for cancelled or expired ones", () => {
    const opts = { refundableOnlinePayments: true };
    expect(organizerEventActions(confirmed, new Date("2026-10-02T18:30:00Z"), opts).menu).toContain("REFUND_ALL");
    expect(organizerEventActions(confirmed, new Date("2026-10-02T20:00:00Z"), opts).menu).toContain("REFUND_ALL");
    expect(organizerEventActions({ ...confirmed, status: EventStatus.CANCELLED }, new Date("2026-10-01T20:00:00Z"), opts).menu).not.toContain("REFUND_ALL");
  });

  it("is not offered when nothing is refundable", () => {
    expect(organizerEventActions(confirmed, new Date("2026-10-01T20:00:00Z")).menu).not.toContain("REFUND_ALL");
  });
});

describe("hasCapacity", () => {
  it("has no limit when maxPlayers is null", () => {
    expect(hasCapacity({ maxPlayers: null }, 1000)).toBe(true);
  });

  it("has room below the max", () => {
    expect(hasCapacity({ maxPlayers: 10 }, 9)).toBe(true);
  });

  it("is full at the max", () => {
    expect(hasCapacity({ maxPlayers: 10 }, 10)).toBe(false);
  });
});
