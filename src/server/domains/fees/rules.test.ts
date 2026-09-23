import { describe, expect, it } from "vitest";
import { DEFAULT_FEE_SCHEDULE, currentSchedule, feeForAmountCents, feeTiersSchema } from "./rules";

describe("feeForAmountCents", () => {
  it.each([
    [1, 50],
    [500, 50],
    [2050, 50],
    [100_000, 50], // open-ended: any amount
  ])("game payment of %d cents costs %d cents", (amount, fee) => {
    expect(feeForAmountCents(DEFAULT_FEE_SCHEDULE.gameCardFeeTiers, amount)).toBe(fee);
  });

  it.each([
    [2000, 100],
    [5000, 150],
    [10_000, 250],
    [3000, 150], // between tiers: the next tier up
  ])("top-up of %d cents costs %d cents", (amount, fee) => {
    expect(feeForAmountCents(DEFAULT_FEE_SCHEDULE.topUpFeeTiers, amount)).toBe(fee);
  });

  it("refuses an amount above the last bounded tier", () => {
    expect(() => feeForAmountCents(DEFAULT_FEE_SCHEDULE.topUpFeeTiers, 10_001)).toThrow("No fee tier");
  });
});

describe("feeTiersSchema", () => {
  it("accepts ascending tiers closed by an open-ended one", () => {
    expect(feeTiersSchema.safeParse([{ upToCents: 1000, feeCents: 50 }, { upToCents: null, feeCents: 80 }]).success).toBe(true);
  });

  it.each([
    ["empty", []],
    ["descending", [{ upToCents: 2000, feeCents: 50 }, { upToCents: 1000, feeCents: 80 }]],
    ["duplicate bounds", [{ upToCents: 1000, feeCents: 50 }, { upToCents: 1000, feeCents: 80 }]],
    ["open-ended tier first", [{ upToCents: null, feeCents: 50 }, { upToCents: 1000, feeCents: 80 }]],
    ["negative fee", [{ upToCents: 1000, feeCents: -1 }]],
  ])("rejects %s tiers", (_name, tiers) => {
    expect(feeTiersSchema.safeParse(tiers).success).toBe(false);
  });
});

describe("currentSchedule", () => {
  const v1 = { version: 1, effectiveFrom: new Date("2026-01-01T00:00:00Z") };
  const v2 = { version: 2, effectiveFrom: new Date("2026-06-01T00:00:00Z") };

  it("is the latest schedule already in effect", () => {
    expect(currentSchedule([v1, v2], new Date("2026-07-01T00:00:00Z"))).toBe(v2);
  });

  it("ignores schedules that take effect later", () => {
    expect(currentSchedule([v1, v2], new Date("2026-05-31T23:59:59Z"))).toBe(v1);
  });

  it("is undefined before any schedule", () => {
    expect(currentSchedule([v1], new Date("2025-12-31T00:00:00Z"))).toBeUndefined();
  });
});
