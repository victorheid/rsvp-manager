import type { EventModel } from "@/generated/prisma/models";
import { formatCents, formatDateTime } from "@/lib/format";
import type { PushMessage } from "@/server/integrations/push";

/**
 * What we tell people, and when (spec §9). Pure functions only: no Prisma
 * calls, no Date.now(), no I/O. Actions decide *who* to tell; this file
 * decides the words.
 */

export const NOTIFICATION_KINDS = [
  "NEW_EVENT",
  "EVENT_CONFIRMED",
  "EVENT_CHANGED",
  "EVENT_CANCELLED",
  "REMOVED",
  "SPOT_OPEN",
  "TEST",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export interface NotificationMessage extends PushMessage {
  kind: NotificationKind;
}

type NotifiedEvent = Pick<EventModel, "slug" | "title" | "startsAt">;

const eventUrl = (event: Pick<EventModel, "slug">) => `/e/${event.slug}`;

/** §9 trigger: "New event posted" → group members. */
export function newEventMessage(event: NotifiedEvent, groupName: string): NotificationMessage {
  return {
    kind: "NEW_EVENT",
    title: `${groupName}: new game`,
    body: `${event.title} · ${formatDateTime(event.startsAt)}. Tap to join.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Event confirmed + amount charged" → everyone in. */
export function eventConfirmedMessage(
  event: NotifiedEvent & Pick<EventModel, "lockedPriceCents">,
): NotificationMessage {
  const price = event.lockedPriceCents === null ? "" : ` Your price: ${formatCents(event.lockedPriceCents)}.`;

  return {
    kind: "EVENT_CONFIRMED",
    title: "Game confirmed",
    body: `${event.title} is on for ${formatDateTime(event.startsAt)}.${price}`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Event details changed" → everyone in, and waitlist. */
export function eventChangedMessage(event: NotifiedEvent): NotificationMessage {
  return {
    kind: "EVENT_CHANGED",
    title: "Game details changed",
    body: `${event.title} was updated. Tap to see what's new.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Event cancelled + refund" → everyone in, and waitlist. */
export function eventCancelledMessage(event: NotifiedEvent): NotificationMessage {
  return {
    kind: "EVENT_CANCELLED",
    title: "Game cancelled",
    body: `${event.title} on ${formatDateTime(event.startsAt)} was cancelled.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Removed by organizer" → that person. */
export function removedMessage(event: NotifiedEvent): NotificationMessage {
  return {
    kind: "REMOVED",
    title: "You were removed from a game",
    body: `The organizer removed you from ${event.title}.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Spot open (notify-me waitlist)" → notify-me entries. */
export function spotOpenMessage(event: NotifiedEvent): NotificationMessage {
  return {
    kind: "SPOT_OPEN",
    title: "A spot opened up",
    body: `${event.title} has room now. First to claim it gets it.`,
    url: eventUrl(event),
  };
}

/** The "Send test" button on /me. */
export function testMessage(): NotificationMessage {
  return { kind: "TEST", title: "Notifications are on", body: "You'll get game updates here.", url: "/" };
}
