import { describe, expect, it } from "vitest";
import {
  eventCancelledMessage,
  eventChangedMessage,
  eventConfirmedMessage,
  newEventMessage,
  removedMessage,
  spotOpenMessage,
} from "@/server/domains/notifications/rules";

const event = { slug: "friday-game-abc", title: "Friday game", startsAt: new Date("2026-10-02T18:00:00Z") };

describe("notification messages", () => {
  it("link every message to the event page", () => {
    const messages = [
      newEventMessage(event, "Futsal"),
      eventConfirmedMessage({ ...event, lockedPriceCents: 800 }),
      eventChangedMessage(event),
      eventCancelledMessage(event),
      removedMessage(event),
      spotOpenMessage(event),
    ];

    expect(messages.map((message) => message.url)).toEqual(Array(6).fill("/e/friday-game-abc"));
  });

  it("tags each message with its trigger", () => {
    expect(newEventMessage(event, "Futsal").kind).toBe("NEW_EVENT");
    expect(eventConfirmedMessage({ ...event, lockedPriceCents: 800 }).kind).toBe("EVENT_CONFIRMED");
    expect(eventChangedMessage(event).kind).toBe("EVENT_CHANGED");
    expect(eventCancelledMessage(event).kind).toBe("EVENT_CANCELLED");
    expect(removedMessage(event).kind).toBe("REMOVED");
    expect(spotOpenMessage(event).kind).toBe("SPOT_OPEN");
  });

  it("shows the locked price when confirming", () => {
    expect(eventConfirmedMessage({ ...event, lockedPriceCents: 800 }).body).toContain("€8.00");
    expect(eventConfirmedMessage({ ...event, lockedPriceCents: null }).body).not.toContain("price");
  });
});
