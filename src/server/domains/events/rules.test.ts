import { describe, expect, it } from "vitest";
import { PricingMode, EventStatus } from "@/generated/prisma/enums";
import {
  canSelfCancel,
  eventPhase,
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
    autoChargeAtCutoff: true,
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
      basedOnTitle: "Thursday 5-a-side",
    });
  });

  it("uses 90 minutes and a 24h cut-off for a group's first game", () => {
    const defaults = suggestEventDefaults({ groupName: "Westside", lastEvent: null }, nextStart);
    expect(defaults.endsAt).toEqual(new Date("2026-09-24T19:30:00Z"));
    expect(defaults.cutoffAt).toEqual(new Date("2026-09-23T18:00:00Z"));
    expect(defaults.basedOnTitle).toBeNull();
    expect(defaults.location).toBe("");
  });
});
