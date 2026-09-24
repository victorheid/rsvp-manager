import { describe, expect, it } from "vitest";
import {
  cutoffReminderMessage,
  eventCancelledMessage,
  eventChangedMessage,
  eventConfirmedMessage,
  isMoneyRelated,
  newEventMessage,
  organizerCutoffAlertMessage,
  paymentFailedMessage,
  refundIssuedMessage,
  markedDroppedOutMessage,
  smsBody,
  spotHeldMessage,
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
      markedDroppedOutMessage(event),
      spotOpenMessage(event),
    ];

    expect(messages.map((message) => message.url)).toEqual(Array(6).fill("/e/friday-game-abc"));
  });

  it("reminds people when sign-ups close", () => {
    const reminder = cutoffReminderMessage({ ...event, cutoffAt: new Date("2026-10-01T18:00:00Z") });
    expect(reminder.kind).toBe("CUTOFF_REMINDER");
    expect(reminder.url).toBe("/e/friday-game-abc");
  });

  it("tags each message with its trigger", () => {
    expect(newEventMessage(event, "Futsal").kind).toBe("NEW_EVENT");
    expect(eventConfirmedMessage({ ...event, lockedPriceCents: 800 }).kind).toBe("EVENT_CONFIRMED");
    expect(eventChangedMessage(event).kind).toBe("EVENT_CHANGED");
    expect(eventCancelledMessage(event).kind).toBe("EVENT_CANCELLED");
    expect(markedDroppedOutMessage(event).kind).toBe("MARKED_DROPPED_OUT");
    expect(spotOpenMessage(event).kind).toBe("SPOT_OPEN");
  });

  it("shows the locked price when confirming", () => {
    expect(eventConfirmedMessage({ ...event, lockedPriceCents: 800 }).body).toContain("€8.00");
    expect(eventConfirmedMessage({ ...event, lockedPriceCents: null }).body).not.toContain("price");
  });
});

describe("isMoneyRelated", () => {
  it.each([
    ["EVENT_CONFIRMED", true],
    ["EVENT_CANCELLED", true],
    ["SPOT_HELD", true],
    ["PAYMENT_FAILED", true],
    ["REFUND_ISSUED", true],
    ["NEW_EVENT", false],
    ["EVENT_CHANGED", false],
    ["MARKED_DROPPED_OUT", false],
    ["SPOT_OPEN", false],
    ["TEST", false],
  ] as const)("%s → %s", (kind, expected) => {
    expect(isMoneyRelated(kind)).toBe(expected);
  });
});

describe("smsBody", () => {
  const message = { title: "Game cancelled", body: "Friday game was cancelled.", url: "/e/friday" };

  it("appends a link when the app's address is known", () => {
    expect(smsBody(message, "https://rsvp.example")).toBe(
      "Game cancelled. Friday game was cancelled. https://rsvp.example/e/friday",
    );
  });

  it("is just the text otherwise", () => {
    expect(smsBody(message, undefined)).toBe("Game cancelled. Friday game was cancelled.");
  });
});

describe("organizerCutoffAlertMessage", () => {
  const alertEvent = { ...event, minPlayers: 4 };

  it("says the game can't run yet when the minimum wasn't met", () => {
    expect(organizerCutoffAlertMessage(alertEvent, 3).body).toContain("3 of the 4 players needed");
  });

  it("asks for a decision when the minimum was met but auto-charge is off", () => {
    expect(organizerCutoffAlertMessage(alertEvent, 5).body).toContain("Confirm the game or cancel it");
  });

  it("links to the Manage screen", () => {
    expect(organizerCutoffAlertMessage(alertEvent, 5).url).toBe("/e/friday-game-abc/manage");
  });
});

describe("payment messages", () => {
  it("send the player to their pay link with the amount owed", () => {
    const message = paymentFailedMessage(event, "tok123", 850);

    expect(message).toMatchObject({ kind: "PAYMENT_FAILED", url: "/pay/tok123" });
    expect(message.body).toContain("€8.50");
  });

  it("say how much was refunded", () => {
    expect(refundIssuedMessage(event, 800).body).toContain("€8.00");
  });
});

describe("waitlist messages", () => {
  it("tell the next person a spot is held for them, and until when", () => {
    const message = spotHeldMessage(event, new Date("2026-10-01T20:00:00Z"));
    expect(message).toMatchObject({ kind: "SPOT_HELD", url: "/e/friday-game-abc" });
    expect(message.body).toContain("21:00"); // shown in the event's time zone (Irish summer time)
  });
});
