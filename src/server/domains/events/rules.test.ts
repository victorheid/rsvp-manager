import { describe, expect, it } from "vitest";
import { PricingMode, EventStatus } from "@/generated/prisma/enums";
import {
  canSelfCancel,
  isDisallowedPriceIncrease,
  isExpired,
  perHeadPriceCents,
  shouldAutoConfirmAtCutoff,
  splitPriceRangeCents,
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
  it("allows self-cancel while open", () => {
    expect(canSelfCancel({ status: EventStatus.OPEN })).toBe(true);
  });

  it("blocks self-cancel once confirmed", () => {
    expect(canSelfCancel({ status: EventStatus.CONFIRMED })).toBe(false);
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
