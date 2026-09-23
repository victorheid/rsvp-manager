import { describe, expect, it } from "vitest";
import { attentionRank, matchesFilter, personDetail, personName } from "./managePresentation";

const base = {
  status: "GOING",
  paymentStatus: "PENDING",
  paymentMethod: "CASH",
  attended: null,
  userId: "u1",
  walkInName: null,
  noShowCount: 0,
} as const;

function detail(overrides: Partial<Parameters<typeof personDetail>[0]["rsvp"]>, phase: Parameters<typeof personDetail>[0]["phase"] = "OPEN", own = false) {
  return personDetail({ rsvp: { ...base, ...overrides }, phase, isOrganizersOwnRsvp: own, amountCents: 800 });
}

describe("personDetail", () => {
  it("says cash is on the day, calmly, before the game", () => {
    expect(detail({}, "CONFIRMED")).toEqual({ text: "Cash on the day", tone: "neutral" });
  });

  it("flags cash still to collect once the game has started", () => {
    expect(detail({}, "LIVE")).toEqual({ text: "Cash · €8.00 to collect", tone: "warning" });
  });

  it("flags money owed in red", () => {
    expect(detail({ paymentStatus: "OWES" }, "CONFIRMED")).toEqual({ text: "Owes €8.00", tone: "danger" });
  });

  it("keeps paid rows calm", () => {
    expect(detail({ paymentStatus: "PAID_OUTSIDE_APP" })).toEqual({ text: "Paid outside app · €8.00", tone: "neutral" });
    expect(detail({ paymentStatus: "CHARGED", paymentMethod: "CARD" })).toEqual({ text: "Paid online · €8.00", tone: "neutral" });
  });

  it("flags a no-show in red, keeping the payment", () => {
    expect(detail({ attended: false, paymentStatus: "CHARGED", paymentMethod: "CARD" }, "LIVE")).toEqual({
      text: "No-show · Paid online · €8.00",
      tone: "danger",
    });
  });

  it("tags walk-ins and the organizer", () => {
    expect(detail({ userId: null, walkInName: "Dana", paymentStatus: "PAID_OUTSIDE_APP" }).text).toBe(
      "Walk-in · Paid outside app · €8.00",
    );
    expect(detail({}, "OPEN", true).text).toBe("Organizer · Cash on the day");
  });

  it("marks people who dropped out and keeps what they paid visible", () => {
    expect(detail({ status: "CANCELLED", paymentStatus: "OWES" }, "CONFIRMED")).toEqual({
      text: "Dropped out · Owes €8.00",
      tone: "danger",
    });
  });

  it("mentions past no-shows in this group", () => {
    expect(detail({ noShowCount: 2 }).text).toBe("Cash on the day · 2 past no-shows");
    expect(detail({ noShowCount: 1 }).text).toBe("Cash on the day · 1 past no-show");
  });

  it("doesn't count the no-show that was just marked as a 'past' one", () => {
    expect(detail({ attended: false, noShowCount: 1 }).text).toBe("No-show · Cash on the day");
    expect(detail({ attended: false, noShowCount: 3 }).text).toBe("No-show · Cash on the day · 2 past no-shows");
  });

  it("doesn't flag the organizer's own cash as something to collect", () => {
    expect(detail({}, "LIVE", true)).toEqual({ text: "Organizer · Cash · €8.00 to collect", tone: "neutral" });
  });
});

describe("personName", () => {
  it("uses first name and last initial for players, and the typed name for walk-ins", () => {
    expect(personName({ user: { id: "u", firstName: "Aoife", lastInitial: "M", phoneNumber: "+353" }, walkInName: null })).toBe("Aoife M.");
    expect(personName({ user: null, walkInName: "Dana" })).toBe("Dana");
  });
});

describe("matchesFilter", () => {
  it("filters owes, cash to collect and no-shows", () => {
    expect(matchesFilter({ ...base, paymentStatus: "OWES" }, "OWES")).toBe(true);
    expect(matchesFilter(base, "CASH")).toBe(true);
    expect(matchesFilter({ ...base, paymentStatus: "PAID_OUTSIDE_APP" }, "CASH")).toBe(false);
    expect(matchesFilter({ ...base, attended: false }, "NO_SHOWS")).toBe(true);
    expect(matchesFilter({ ...base, status: "CANCELLED", attended: false }, "NO_SHOWS")).toBe(false);
    expect(matchesFilter(base, "ALL")).toBe(true);
  });
});

describe("attentionRank", () => {
  it("puts people who owe first, then cash to collect once started, then everyone else", () => {
    expect(attentionRank({ ...base, paymentStatus: "OWES" }, "LIVE")).toBe(0);
    expect(attentionRank(base, "LIVE")).toBe(1);
    expect(attentionRank(base, "CONFIRMED")).toBe(2);
  });
});
