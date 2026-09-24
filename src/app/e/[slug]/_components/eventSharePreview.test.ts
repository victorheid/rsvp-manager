import { describe, expect, it } from "vitest";
import { eventSharePreview, eventShareImagePath, eventShareUrl, sharePreviewVersion } from "./eventSharePreview";

const now = new Date("2025-09-20T12:00:00Z");

const base = {
  title: "Thursday 5-a-side",
  startsAt: new Date("2025-09-25T18:00:00Z"),
  endsAt: new Date("2025-09-25T19:30:00Z"),
  status: "OPEN",
  location: "Westside Sports Hall",
  rsvps: [{ userId: "u1" }, { userId: "u2" }, { userId: null }],
  maxPlayers: 10,
  spotsHeld: 1,
  priceDisplay: { mode: "fixed", amountCents: 800 },
} as const;

function preview(overrides: Partial<Parameters<typeof eventSharePreview>[0]> = {}) {
  return eventSharePreview({ ...base, ...overrides }, now);
}

describe("eventSharePreview", () => {
  it("shows when and where, the headcount, spots left and the price", () => {
    expect(preview()).toEqual({
      title: "Thursday 5-a-side",
      details: "Thu 25 Sep · 19:00 · Westside Sports Hall",
      // Walk-ins count in the headcount but not against the max; held spots aren't free.
      summary: "3/10 in · 7 spots left · €8.00 each",
      status: "Open",
    });
  });

  it("leaves out spots left when there's no limit", () => {
    expect(preview({ maxPlayers: null }).summary).toBe("3 in · €8.00 each");
  });

  it("says the game's status", () => {
    expect(preview({ status: "CANCELLED" }).status).toBe("Cancelled");
  });
});

describe("sharePreviewVersion", () => {
  it("stays the same while the preview does", () => {
    expect(sharePreviewVersion(preview())).toBe(sharePreviewVersion(preview()));
  });

  it("changes when anything on the card changes", () => {
    const version = sharePreviewVersion(preview());
    expect(sharePreviewVersion(preview({ spotsHeld: 0 }))).not.toBe(version);
    expect(sharePreviewVersion(preview({ status: "CONFIRMED" }))).not.toBe(version);
    expect(sharePreviewVersion(preview({ location: "Eastside" }))).not.toBe(version);
  });
});

describe("share links", () => {
  it("version the page and its image the same way", () => {
    const version = sharePreviewVersion(preview());
    expect(eventShareUrl("https://example.com", "thu-5", preview())).toBe(`https://example.com/e/thu-5?v=${version}`);
    expect(eventShareImagePath("thu-5", preview())).toBe(`/e/thu-5/og?v=${version}`);
  });
});
