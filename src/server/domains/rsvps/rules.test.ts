import { describe, expect, it } from "vitest";
import { EventStatus } from "@/generated/prisma/enums";
import { hasCapacity, isJoinableEventStatus } from "./rules";

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

describe("isJoinableEventStatus", () => {
  it("allows joining while open or confirmed", () => {
    expect(isJoinableEventStatus(EventStatus.OPEN)).toBe(true);
    expect(isJoinableEventStatus(EventStatus.CONFIRMED)).toBe(true);
  });

  it("blocks joining once cancelled or expired", () => {
    expect(isJoinableEventStatus(EventStatus.CANCELLED)).toBe(false);
    expect(isJoinableEventStatus(EventStatus.EXPIRED)).toBe(false);
  });
});
