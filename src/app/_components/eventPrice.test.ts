import { describe, expect, it } from "vitest";
import { eventPriceText, headcountText } from "./eventPrice";

const base = {
  status: "OPEN",
  pricingMode: "FIXED_PER_HEAD",
  totalCostCents: 800,
  minPlayers: 6,
  maxPlayers: 12,
  lockedPriceCents: null,
} as const;

describe("eventPriceText", () => {
  it("shows a flat amount for fixed pricing", () => {
    expect(eventPriceText(base)).toBe("€8.00 each");
  });

  it("shows a range for split pricing before confirmation", () => {
    expect(eventPriceText({ ...base, pricingMode: "SPLIT_EVENLY", totalCostCents: 8000 })).toBe("€6.67–€13.34 each");
  });

  it("shows 'up to' when there's no max", () => {
    expect(eventPriceText({ ...base, pricingMode: "SPLIT_EVENLY", totalCostCents: 8000, maxPlayers: null })).toBe(
      "Up to €13.34 each",
    );
  });

  it("shows the locked price once confirmed, ignoring the mode", () => {
    expect(
      eventPriceText({ ...base, status: "CONFIRMED", pricingMode: "SPLIT_EVENLY", totalCostCents: 8000, lockedPriceCents: 800 }),
    ).toBe("€8.00 each");
  });
});

describe("headcountText", () => {
  it("shows going out of max", () => {
    expect(headcountText(8, 12)).toBe("8/12 in");
  });

  it("drops the max when there's no limit", () => {
    expect(headcountText(8, null)).toBe("8 in");
  });
});
