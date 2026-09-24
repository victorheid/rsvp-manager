import type { EventModel } from "@/generated/prisma/models";
import { formatCents, formatDateTime, formatTime } from "@/lib/format";
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
  "MARKED_DROPPED_OUT",
  "SPOT_OPEN",
  "CUTOFF_REMINDER",
  "ORGANIZER_CUTOFF_ALERT",
  "SPOT_HELD",
  "PAYMENT_FAILED",
  "REFUND_ISSUED",
  "TEST",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * §9: SMS/WhatsApp is only for money-related messages, to keep costs down —
 * charged, payment failed, cancelled/refunded, and a spot held for you
 * (it runs out). Everything else is web push only.
 */
const MONEY_RELATED_KINDS: readonly NotificationKind[] = [
  "EVENT_CONFIRMED",
  "EVENT_CANCELLED",
  "SPOT_HELD",
  "PAYMENT_FAILED",
  "REFUND_ISSUED",
];

export function isMoneyRelated(kind: NotificationKind): boolean {
  return MONEY_RELATED_KINDS.includes(kind);
}

/** The SMS text for a message: the push text plus a link when we know the app's address. */
export function smsBody(message: PushMessage, appUrl: string | undefined): string {
  const text = `${message.title}. ${message.body}`;
  return appUrl ? `${text} ${new URL(message.url, appUrl).href}` : text;
}

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

/** §9 trigger: "Marked as dropped out by organizer" → that person (in the game or on the waitlist, §8). */
export function markedDroppedOutMessage(event: NotifiedEvent): NotificationMessage {
  return {
    kind: "MARKED_DROPPED_OUT",
    title: "You've been marked as dropped out",
    body: `The organizer marked you as dropped out of ${event.title}.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Spot open (first-to-claim waitlist)" → everyone on the waitlist without a held spot. */
export function spotOpenMessage(event: NotifiedEvent): NotificationMessage {
  return {
    kind: "SPOT_OPEN",
    title: "A spot opened up",
    body: `${event.title} has room now. First to take it gets it.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Cut-off reminder" → everyone in, and waitlist. */
export function cutoffReminderMessage(event: NotifiedEvent & Pick<EventModel, "cutoffAt">): NotificationMessage {
  return {
    kind: "CUTOFF_REMINDER",
    title: "Cut-off coming up",
    body: `${event.title}: sign-ups close ${formatDateTime(event.cutoffAt)}. Can't make it? Drop out before then.`,
    url: eventUrl(event),
  };
}

/**
 * §9 trigger: "Cut-off passed without min met, or auto-charge off" →
 * organizer. Says what's actually being asked: with the minimum unmet the
 * game can't be confirmed, only waited on or cancelled.
 */
export function organizerCutoffAlertMessage(
  event: NotifiedEvent & Pick<EventModel, "minPlayers">,
  headcount: number,
): NotificationMessage {
  const body =
    headcount < event.minPlayers
      ? `${event.title}: sign-ups closed with ${headcount} of the ${event.minPlayers} players needed. Wait for more, or cancel it.`
      : `${event.title}: sign-ups closed with ${headcount} in. Confirm the game or cancel it.`;

  return {
    kind: "ORGANIZER_CUTOFF_ALERT",
    title: "Your game needs a decision",
    body,
    url: `${eventUrl(event)}/manage`,
  };
}

/** §9 trigger: "Spot held for you" (in-order waitlist, §6) → that person. */
export function spotHeldMessage(event: NotifiedEvent, heldUntil: Date): NotificationMessage {
  return {
    kind: "SPOT_HELD",
    title: "A spot is yours",
    body: `A spot opened in ${event.title}. It's held for you until ${formatTime(heldUntil)}.`,
    url: eventUrl(event),
  };
}

/** §9 trigger: "Payment failed + pay link" → that person. */
export function paymentFailedMessage(
  event: NotifiedEvent,
  payToken: string,
  owedCents: number,
): NotificationMessage {
  return {
    kind: "PAYMENT_FAILED",
    title: "Your payment didn't go through",
    body: `We couldn't charge your card ${formatCents(owedCents)} for ${event.title}. Tap to pay.`,
    url: `/pay/${payToken}`,
  };
}

/** §9 trigger: "Refund issued" → that person. */
export function refundIssuedMessage(event: NotifiedEvent, refundedCents: number): NotificationMessage {
  return {
    kind: "REFUND_ISSUED",
    title: "You've been refunded",
    body: `${formatCents(refundedCents)} for ${event.title} is on its way back to you.`,
    url: eventUrl(event),
  };
}

/** The "Send test" button on /me. */
export function testMessage(): NotificationMessage {
  return { kind: "TEST", title: "Notifications are on", body: "You'll get game updates here.", url: "/" };
}
