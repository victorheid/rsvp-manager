import { describe, expect, it } from "vitest";
import { isWaitlistOpen } from "./rules";

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
