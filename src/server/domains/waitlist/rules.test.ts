import { describe, expect, it } from "vitest";
import { isWaitlistOpen, sortWaitlist } from "./rules";

describe("isWaitlistOpen", () => {
  const startsAt = new Date("2026-01-10T19:00:00Z");

  it("is open before the event starts", () => {
    expect(isWaitlistOpen({ startsAt }, new Date("2026-01-10T18:59:00Z"))).toBe(true);
  });

  it("closes at the event start", () => {
    expect(isWaitlistOpen({ startsAt }, startsAt)).toBe(false);
  });

  it("stays closed after the event starts", () => {
    expect(isWaitlistOpen({ startsAt }, new Date("2026-01-10T20:00:00Z"))).toBe(false);
  });
});

describe("sortWaitlist", () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute));

  it("puts auto-join entries before notify-me entries, first come first served within each", () => {
    const entries = [
      { id: "manual-early", promotionMode: "MANUAL", createdAt: at(0) },
      { id: "auto-late", promotionMode: "AUTO", createdAt: at(30) },
      { id: "auto-early", promotionMode: "AUTO", createdAt: at(10) },
      { id: "manual-late", promotionMode: "MANUAL", createdAt: at(20) },
    ] as const;

    expect(sortWaitlist(entries).map((entry) => entry.id)).toEqual(["auto-early", "auto-late", "manual-early", "manual-late"]);
  });

  it("doesn't change the list it's given", () => {
    const entries = [
      { promotionMode: "MANUAL", createdAt: at(5) },
      { promotionMode: "AUTO", createdAt: at(9) },
    ] as const;

    sortWaitlist(entries);

    expect(entries.map((entry) => entry.promotionMode)).toEqual(["MANUAL", "AUTO"]);
  });
});
