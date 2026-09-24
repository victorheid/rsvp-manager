import { describe, expect, it } from "vitest";
import { formatCents, formatDateTime, formatRelativeDay, formatTimeRange } from "./format";

describe("formatCents", () => {
  it("always shows cents", () => {
    expect(formatCents(800)).toBe("€8.00");
    expect(formatCents(667)).toBe("€6.67");
    expect(formatCents(0)).toBe("€0.00");
  });
});

describe("formatDateTime", () => {
  it("shows the day and 24h time in the event's timezone", () => {
    // 18:00 UTC in September is 19:00 in Dublin (UTC+1).
    expect(formatDateTime(new Date("2026-09-24T18:00:00Z"))).toBe("Thu 24 Sep · 19:00");
  });

  it("rolls over to the next day in the event's timezone", () => {
    expect(formatDateTime(new Date("2026-09-24T23:30:00Z"))).toBe("Fri 25 Sep · 00:30");
  });
});

describe("formatTimeRange", () => {
  it("shows start day and time then the end time", () => {
    expect(formatTimeRange(new Date("2026-09-24T18:00:00Z"), new Date("2026-09-24T19:30:00Z"))).toBe(
      "Thu 24 Sep · 19:00–20:30",
    );
  });
});

describe("formatRelativeDay", () => {
  const now = new Date("2026-09-23T10:00:00Z");

  it("uses plain words near today", () => {
    expect(formatRelativeDay(new Date("2026-09-23T18:00:00Z"), now)).toBe("today");
    expect(formatRelativeDay(new Date("2026-09-24T18:00:00Z"), now)).toBe("tomorrow");
  });

  it("counts days further out", () => {
    expect(formatRelativeDay(new Date("2026-09-25T18:00:00Z"), now)).toBe("in 2 days");
  });
});
