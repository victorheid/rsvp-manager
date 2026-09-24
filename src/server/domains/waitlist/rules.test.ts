import { describe, expect, it } from "vitest";
import { holdEndsAt, isHoldActive, isWaitlistOpen, organizerWaitlistRowActions, planWaitlist, sortWaitlist, spotsHeldForOthers } from "./rules";

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 0, 10, hour, minute));
const startsAt = at(19);

describe("isWaitlistOpen", () => {
  it("is open before the event starts", () => {
    expect(isWaitlistOpen({ startsAt }, at(18, 59))).toBe(true);
  });

  it("closes at the event start", () => {
    expect(isWaitlistOpen({ startsAt }, startsAt)).toBe(false);
  });

  it("stays closed after the event starts", () => {
    expect(isWaitlistOpen({ startsAt }, at(20))).toBe(false);
  });
});

function entry(id: string, queuedAt: Date, extra: Partial<{ status: "WAITING" | "DROPPED_OUT"; heldUntil: Date | null; missedHoldAt: Date | null }> = {}) {
  return { id, userId: `user-${id}`, status: "WAITING" as const, queuedAt, heldUntil: null, missedHoldAt: null, ...extra };
}

describe("sortWaitlist", () => {
  it("is first come, first served by place in line", () => {
    const entries = [entry("late", at(12, 30)), entry("early", at(12, 10)), entry("middle", at(12, 20))];

    expect(sortWaitlist(entries).map((e) => e.id)).toEqual(["early", "middle", "late"]);
  });

  it("leaves out people who dropped out", () => {
    const entries = [entry("gone", at(12), { status: "DROPPED_OUT" }), entry("waiting", at(13))];

    expect(sortWaitlist(entries).map((e) => e.id)).toEqual(["waiting"]);
  });

  it("doesn't change the list it's given", () => {
    const entries = [entry("b", at(13)), entry("a", at(12))];

    sortWaitlist(entries);

    expect(entries.map((e) => e.id)).toEqual(["b", "a"]);
  });
});

describe("isHoldActive and spotsHeldForOthers", () => {
  const now = at(12);

  it.each([
    ["no hold", entry("a", at(9)), false],
    ["hold still running", entry("a", at(9), { heldUntil: at(13) }), true],
    ["hold ends exactly now", entry("a", at(9), { heldUntil: now }), false],
    ["dropped out with a hold", entry("a", at(9), { heldUntil: at(13), status: "DROPPED_OUT" }), false],
  ])("%s", (_label, e, expected) => {
    expect(isHoldActive(e, now)).toBe(expected);
  });

  it("doesn't count the viewer's own hold, so they can take it", () => {
    const entries = [entry("a", at(9), { heldUntil: at(13) }), entry("b", at(10), { heldUntil: at(13) }), entry("c", at(11))];

    expect(spotsHeldForOthers(entries, "user-a", now)).toBe(1);
    expect(spotsHeldForOthers(entries, "someone-else", now)).toBe(2);
  });
});

describe("holdEndsAt", () => {
  const inOrder = { waitlistMode: "IN_ORDER" as const, waitlistHoldMinutes: 60, startsAt };

  it.each([
    ["in order: now + the hold time", inOrder, at(12), at(13)],
    ["in order, custom hold time", { ...inOrder, waitlistHoldMinutes: 30 }, at(12), at(12, 30)],
    ["a hold ending exactly at the start is fine", inOrder, at(18), at(19)],
    ["a hold that would run past the start: not held", inOrder, at(18, 30), null],
    ["first to claim: never held", { ...inOrder, waitlistMode: "FIRST_TO_CLAIM" as const }, at(12), null],
  ])("%s", (_label, event, now, expected) => {
    expect(holdEndsAt(event, now)).toEqual(expected);
  });
});

describe("planWaitlist", () => {
  const event = { maxPlayers: 10, waitlistMode: "IN_ORDER" as const, waitlistHoldMinutes: 60, startsAt };
  const now = at(12);

  it("does nothing while the game is full", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9))], goingCount: 10, now });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 0 });
  });

  it("holds a freed spot for the first person in line", () => {
    const plan = planWaitlist({ event, entries: [entry("b", at(10)), entry("a", at(9))], goingCount: 9, now });

    expect(plan.grant).toEqual([{ id: "a", userId: "user-a", heldUntil: at(13) }]);
    expect(plan.openSpots).toBe(0);
  });

  it("holds two spots for the first two people", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9)), entry("b", at(10)), entry("c", at(11))], goingCount: 8, now });

    expect(plan.grant.map((g) => g.id)).toEqual(["a", "b"]);
  });

  it("counts a running hold against max, so it isn't handed out twice", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9), { heldUntil: at(12, 30) }), entry("b", at(10))], goingCount: 9, now });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 0 });
  });

  it("moves someone whose hold ran out to the end, and holds the spot for the next person", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9), { heldUntil: at(11, 30) }), entry("b", at(10))], goingCount: 9, now });

    expect(plan.expire).toEqual([{ id: "a", userId: "user-a", queuedAt: at(11, 30) }]);
    expect(plan.grant).toEqual([{ id: "b", userId: "user-b", heldUntil: at(13) }]);
  });

  it("never holds a spot again for someone who already missed one: it's open instead", () => {
    const entries = [entry("a", at(11, 30), { missedHoldAt: at(11, 30) })];

    const plan = planWaitlist({ event, entries, goingCount: 9, now });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 1 });
  });

  it("opens the spot when the only person waiting just let their hold run out", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9), { heldUntil: at(11, 30) })], goingCount: 9, now });

    expect(plan.expire.map((e) => e.id)).toEqual(["a"]);
    expect(plan).toMatchObject({ grant: [], openSpots: 1 });
  });

  it("skips people who dropped out", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9), { status: "DROPPED_OUT" }), entry("b", at(10))], goingCount: 9, now });

    expect(plan.grant.map((g) => g.id)).toEqual(["b"]);
  });

  it("first to claim: nothing is held, the spot is open", () => {
    const plan = planWaitlist({ event: { ...event, waitlistMode: "FIRST_TO_CLAIM" }, entries: [entry("a", at(9))], goingCount: 9, now });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 1 });
  });

  it("close to the start: the spot is open instead of held", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9))], goingCount: 9, now: at(18, 30) });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 1 });
  });

  it("switching mode leaves running holds alone", () => {
    const entries = [entry("a", at(9), { heldUntil: at(12, 30) }), entry("b", at(10))];

    const plan = planWaitlist({ event: { ...event, waitlistMode: "FIRST_TO_CLAIM" }, entries, goingCount: 8, now });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 1 });
  });

  it("does nothing once the game has started", () => {
    const plan = planWaitlist({ event, entries: [entry("a", at(9), { heldUntil: at(18) })], goingCount: 5, now: at(19) });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 0 });
  });

  it("does nothing without a max (there's no waitlist)", () => {
    const plan = planWaitlist({ event: { ...event, maxPlayers: null }, entries: [entry("a", at(9))], goingCount: 30, now });

    expect(plan).toEqual({ expire: [], grant: [], openSpots: 0 });
  });
});

describe("organizerWaitlistRowActions", () => {
  it.each([
    ["waiting, game open", "WAITING", "OPEN", ["MARK_DROPPED_OUT"]],
    ["waiting, game confirmed", "WAITING", "CONFIRMED", ["MARK_DROPPED_OUT"]],
    ["waiting, game started", "WAITING", "LIVE", []],
    ["waiting, game cancelled", "WAITING", "CANCELLED", []],
    ["already dropped out", "DROPPED_OUT", "OPEN", []],
  ] as const)("%s", (_label, status, phase, expected) => {
    expect(organizerWaitlistRowActions({ status }, phase)).toEqual(expected);
  });
});
