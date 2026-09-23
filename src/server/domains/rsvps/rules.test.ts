import { describe, expect, it } from "vitest";
import { EventStatus } from "@/generated/prisma/enums";
import { hasCapacity, hasShownUp, isJoinableEventStatus, organizerRowActions } from "./rules";

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

describe("hasShownUp", () => {
  it("counts everyone as showed unless marked a no-show", () => {
    expect(hasShownUp({ attended: null })).toBe(true);
    expect(hasShownUp({ attended: true })).toBe(true);
    expect(hasShownUp({ attended: false })).toBe(false);
  });
});

describe("organizerRowActions", () => {
  const going = { status: "GOING", paymentStatus: "CHARGED", attended: null } as const;
  const cashDue = { status: "GOING", paymentStatus: "PENDING", attended: null } as const;
  const owes = { status: "GOING", paymentStatus: "OWES", attended: null } as const;
  const noShow = { status: "GOING", paymentStatus: "CHARGED", attended: false } as const;
  const droppedOutOwing = { status: "CANCELLED", paymentStatus: "OWES", attended: null } as const;

  function actions(rsvp: Parameters<typeof organizerRowActions>[0]["rsvp"], phase: Parameters<typeof organizerRowActions>[0]["phase"], own = false) {
    return organizerRowActions({ rsvp, phase, isOrganizersOwnRsvp: own });
  }

  it("offers only Remove while the game is open — nothing has been charged or played yet", () => {
    expect(actions(going, "OPEN")).toEqual(["REMOVE"]);
    expect(actions(cashDue, "OPEN")).toEqual(["REMOVE"]);
  });

  it("offers Mark paid once confirmed, ahead of Remove", () => {
    expect(actions(owes, "CONFIRMED")).toEqual(["MARK_PAID", "REMOVE"]);
    expect(actions(going, "CONFIRMED")).toEqual(["REMOVE"]);
  });

  it("offers Mark paid first, then No-show, while the game is live — and never Remove", () => {
    expect(actions(cashDue, "LIVE")).toEqual(["MARK_PAID", "MARK_NO_SHOW"]);
    expect(actions(going, "LIVE")).toEqual(["MARK_NO_SHOW"]);
    expect(actions(going, "LIVE")).not.toContain("REMOVE");
  });

  it("leads with Undo no-show on a no-show", () => {
    expect(actions(noShow, "LIVE")).toEqual(["UNDO_NO_SHOW"]);
    expect(actions({ ...noShow, paymentStatus: "OWES" }, "FINISHED")).toEqual(["UNDO_NO_SHOW", "MARK_PAID"]);
  });

  it("never offers no-show or remove on the organizer's own RSVP", () => {
    expect(actions(going, "LIVE", true)).toEqual([]);
    expect(actions(going, "OPEN", true)).toEqual([]);
  });

  it("only offers Mark paid on someone who dropped out and still owes", () => {
    expect(actions(droppedOutOwing, "CONFIRMED")).toEqual(["MARK_PAID"]);
    expect(actions({ ...droppedOutOwing, paymentStatus: "REFUNDED" }, "CONFIRMED")).toEqual([]);
  });

  it("offers nothing once the event is cancelled or expired", () => {
    expect(actions(going, "CANCELLED")).toEqual([]);
    expect(actions(owes, "EXPIRED")).toEqual([]);
  });
});
