import { describe, expect, it } from "vitest";
import { EVENT_PHASES, eventChip, phaseChip } from "./eventPhase";

describe("phaseChip", () => {
  it("has a label for every phase, so a new phase can't ship unlabelled", () => {
    for (const phase of EVENT_PHASES) {
      expect(phaseChip(phase).label.length).toBeGreaterThan(0);
    }
  });

  it("never shows players the word 'Expired'", () => {
    expect(phaseChip("EXPIRED").label).toBe("Didn’t go ahead");
  });
});

describe("eventChip", () => {
  const event = {
    status: "CONFIRMED",
    startsAt: new Date("2026-09-25T18:00:00Z"),
    endsAt: new Date("2026-09-25T19:30:00Z"),
  } as const;

  it("is 'Game on' before the start, 'In progress' during and 'Finished' after", () => {
    expect(eventChip(event, new Date("2026-09-24T12:00:00Z")).label).toBe("Game on");
    expect(eventChip(event, new Date("2026-09-25T18:30:00Z")).label).toBe("In progress");
    expect(eventChip(event, new Date("2026-09-26T12:00:00Z")).label).toBe("Finished");
  });
});
