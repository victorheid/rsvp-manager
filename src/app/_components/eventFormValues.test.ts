import { describe, expect, it } from "vitest";
import {
  EMPTY_EVENT_FORM_VALUES,
  NO_EDITS,
  applyEdits,
  eventFormToInput,
  recordEdit,
  nextWeeklyStart,
  startsAtFromValues,
  toDatetimeLocalInput,
} from "./eventFormValues";

const filled = {
  ...EMPTY_EVENT_FORM_VALUES,
  title: "Thursday 5-a-side",
  date: "2026-09-24",
  startTime: "19:00",
  endTime: "20:30",
  location: "Westside Sports Hall",
  cutoff: "2026-09-23T19:00",
  totalCostEuros: "80",
};

describe("eventFormToInput", () => {
  it("builds start, end and cut-off from the separate inputs", () => {
    const input = eventFormToInput(filled);
    expect(input.startsAt).toEqual(new Date("2026-09-24T19:00"));
    expect(input.endsAt).toEqual(new Date("2026-09-24T20:30"));
    expect(input.cutoffAt).toEqual(new Date("2026-09-23T19:00"));
  });

  it("rolls the end to the next day when it isn't after the start (overnight games)", () => {
    const input = eventFormToInput({ ...filled, startTime: "23:00", endTime: "01:00" });
    expect(input.endsAt).toEqual(new Date("2026-09-25T01:00"));
  });

  it("converts euros to integer cents without float drift", () => {
    expect(eventFormToInput({ ...filled, totalCostEuros: "6.67" }).totalCostCents).toBe(667);
    expect(eventFormToInput({ ...filled, totalCostEuros: "0.1" }).totalCostCents).toBe(10);
  });

  it("sends no max when 'no limit' is on, and the max otherwise", () => {
    expect(eventFormToInput({ ...filled, noMax: true, maxPlayers: 12 }).maxPlayers).toBeUndefined();
    expect(eventFormToInput({ ...filled, noMax: false, maxPlayers: 12 }).maxPlayers).toBe(12);
  });

  it("omits an empty description", () => {
    expect(eventFormToInput({ ...filled, description: "" }).description).toBeUndefined();
  });
});

describe("startsAtFromValues", () => {
  it("is null until both date and time are filled in", () => {
    expect(startsAtFromValues({ date: "", startTime: "19:00" })).toBeNull();
    expect(startsAtFromValues({ date: "2026-09-24", startTime: "" })).toBeNull();
  });

  it("returns the combined local date-time", () => {
    expect(startsAtFromValues({ date: "2026-09-24", startTime: "19:00" })).toEqual(new Date("2026-09-24T19:00"));
  });
});

describe("toDatetimeLocalInput", () => {
  it("formats a date for a datetime-local input", () => {
    expect(toDatetimeLocalInput(new Date("2026-09-24T19:05"))).toBe("2026-09-24T19:05");
  });
});

describe("nextWeeklyStart", () => {
  it("moves the last game forward one week when that's still ahead", () => {
    const last = new Date("2026-09-17T19:00");
    expect(nextWeeklyStart(last, new Date("2026-09-18T09:00"))).toEqual(new Date("2026-09-24T19:00"));
  });

  it("keeps going until it's in the future when the last game is long past", () => {
    const last = new Date("2026-08-06T19:00");
    expect(nextWeeklyStart(last, new Date("2026-09-18T09:00"))).toEqual(new Date("2026-09-24T19:00"));
  });

  it("never returns a start that's already passed", () => {
    const last = new Date("2026-09-24T19:00");
    expect(nextWeeklyStart(last, new Date("2026-09-24T19:00"))).toEqual(new Date("2026-10-01T19:00"));
  });
});

describe("applyEdits", () => {
  const defaults = { ...filled, title: "Thursday 5-a-side", location: "Westside Sports Hall" };

  it("uses the defaults for everything the organizer hasn't touched", () => {
    expect(applyEdits(defaults, NO_EDITS)).toEqual(defaults);
  });

  it("lets a touched field win over the defaults", () => {
    const edits = recordEdit(NO_EDITS, { ...defaults, title: "Padel night" }, "title");
    expect(applyEdits(defaults, edits).title).toBe("Padel night");
  });

  it("keeps a touched field when the defaults change, and follows them for the rest", () => {
    const edits = recordEdit(NO_EDITS, { ...defaults, title: "Padel night" }, "title");
    const moved = { ...defaults, title: "Saturday 5-a-side", location: "Court 2" };

    const values = applyEdits(moved, edits);
    expect(values.title).toBe("Padel night");
    expect(values.location).toBe("Court 2");
  });
});
