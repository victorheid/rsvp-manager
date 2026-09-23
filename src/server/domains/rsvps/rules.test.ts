import { describe, expect, it } from "vitest";
import { EventStatus } from "@/generated/prisma/enums";
import { freedAWaitlistedSpot, hasCapacity, hasShownUp, isJoinableEventStatus, organizerRowActions } from "./rules";

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
  const going = { status: "GOING", paymentStatus: "CHARGED", paymentMethod: "CASH", attended: null } as const;
  const cashDue = { status: "GOING", paymentStatus: "PENDING", paymentMethod: "CASH", attended: null } as const;
  const owes = { status: "GOING", paymentStatus: "OWES", paymentMethod: "CASH", attended: null } as const;
  const noShow = { status: "GOING", paymentStatus: "CHARGED", paymentMethod: "CASH", attended: false } as const;
  const droppedOutOwing = { status: "CANCELLED", paymentStatus: "OWES", paymentMethod: "CASH", attended: null } as const;

  function actions(
    rsvp: Parameters<typeof organizerRowActions>[0]["rsvp"],
    phase: Parameters<typeof organizerRowActions>[0]["phase"],
    own = false,
    refundsOpen = true,
  ) {
    return organizerRowActions({ rsvp, phase, isOrganizersOwnRsvp: own, refundsOpen });
  }

  describe("Refund (§8)", () => {
    const paidByCard = { status: "GOING", paymentStatus: "CHARGED", paymentMethod: "CARD", attended: null } as const;
    const paidFromWallet = { ...paidByCard, paymentMethod: "WALLET" } as const;
    const droppedOutPaid = { ...paidByCard, status: "CANCELLED" } as const;

    it("is offered on an online payment that went through, last before Remove", () => {
      expect(actions(paidByCard, "OPEN")).toEqual(["REFUND", "REMOVE"]);
      expect(actions(paidFromWallet, "CONFIRMED")).toEqual(["REFUND", "REMOVE"]);
      expect(actions(paidByCard, "LIVE")).toEqual(["MARK_NO_SHOW", "REFUND"]);
    });

    it("is the only action for someone who dropped out after paying", () => {
      expect(actions(droppedOutPaid, "CONFIRMED")).toEqual(["REFUND"]);
      expect(actions(droppedOutPaid, "FINISHED")).toEqual(["REFUND"]);
    });

    it("goes away once the organizer has been paid out", () => {
      expect(actions(droppedOutPaid, "FINISHED", false, false)).toEqual([]);
    });

    it("is never offered for cash, unpaid or already-refunded RSVPs", () => {
      expect(actions({ ...paidByCard, paymentMethod: "CASH" }, "CONFIRMED")).not.toContain("REFUND");
      expect(actions({ ...paidByCard, paymentStatus: "OWES" }, "CONFIRMED")).not.toContain("REFUND");
      expect(actions({ ...paidByCard, paymentStatus: "REFUNDED" }, "CONFIRMED")).not.toContain("REFUND");
    });

    it("still shows on a cancelled event if the cancellation's refund didn't go through", () => {
      expect(actions(paidByCard, "CANCELLED")).toEqual(["REFUND"]);
      expect(actions({ ...paidByCard, paymentStatus: "REFUNDED" }, "CANCELLED")).toEqual([]);
    });
  });

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

describe("freedAWaitlistedSpot", () => {
  it("is true when a full event loses a real player", () => {
    expect(freedAWaitlistedSpot({ maxPlayers: 10 }, { userId: "u1" }, 10)).toBe(true);
  });

  it("is false when there was already room", () => {
    expect(freedAWaitlistedSpot({ maxPlayers: 10 }, { userId: "u1" }, 9)).toBe(false);
  });

  it("is false when there's no max", () => {
    expect(freedAWaitlistedSpot({ maxPlayers: null }, { userId: "u1" }, 50)).toBe(false);
  });

  it("is false for a walk-in, who never held a spot", () => {
    expect(freedAWaitlistedSpot({ maxPlayers: 10 }, { userId: null }, 10)).toBe(false);
  });
});
