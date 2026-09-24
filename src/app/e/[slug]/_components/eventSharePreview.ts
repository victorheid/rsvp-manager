import { formatCents, formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { countsTowardMax } from "@/server/domains/events/rules";
import { eventChip } from "@/app/_components/eventPhase";
import { headcountText } from "@/app/_components/eventPrice";
import type { RsvpModel } from "@/generated/prisma/models";

type SharedEvent = Pick<
  RouterOutputs["events"]["getBySlug"],
  "title" | "startsAt" | "endsAt" | "status" | "location" | "maxPlayers" | "spotsHeld" | "priceDisplay"
> & { rsvps: readonly Pick<RsvpModel, "userId">[] };

/**
 * What a game's link shows in a chat: the share sheet's "what players see"
 * card, the page's Open Graph tags and the `og` image all come from this,
 * so they can't disagree.
 */
export interface EventSharePreview {
  title: string;
  /** "Thu 25 Sep · 19:00 · Westside Sports Hall" */
  details: string;
  /** "8/12 in · 4 spots left · €8.00 each" */
  summary: string;
  /** The phase chip's label: "Open", "Game on", "Cancelled"… */
  status: string;
}

export function eventSharePreview(event: SharedEvent, now: Date): EventSharePreview {
  const players = event.rsvps.filter(countsTowardMax).length;
  const price = event.priceDisplay;
  // What a player would pay: the flat or locked price, or the top of the range while it's still open.
  const priceCents = price.mode === "range" ? price.maxCents : price.amountCents;
  const spotsLeft = event.maxPlayers === null ? null : Math.max(0, event.maxPlayers - players - event.spotsHeld);

  return {
    title: event.title,
    details: `${formatDateTime(event.startsAt)} · ${event.location}`,
    summary: [
      headcountText(event.rsvps.length, event.maxPlayers),
      spotsLeft === null ? null : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`,
      `${formatCents(priceCents)} each`,
    ]
      .filter((part) => part !== null)
      .join(" · "),
    status: eventChip(event, now).label,
  };
}

/**
 * A short fingerprint of the preview. WhatsApp caches a link's preview by its
 * exact URL, so shared links carry `?v=<this>`: same preview, same URL (the
 * cache is fine); anything on the card changed, new URL, fresh preview. The
 * page ignores the parameter.
 */
export function sharePreviewVersion(preview: EventSharePreview): string {
  // FNV-1a, 32-bit: tiny and deterministic. Not security — just "did it change".
  let hash = 0x811c9dc5;
  for (const char of `${preview.title}\n${preview.details}\n${preview.summary}\n${preview.status}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** The link to share: the public event page, versioned by what its preview shows. */
export function eventShareUrl(origin: string, slug: string, preview: EventSharePreview): string {
  return `${origin}/e/${slug}?v=${sharePreviewVersion(preview)}`;
}

/** The Open Graph image for the same preview, versioned the same way (WhatsApp caches images by URL too). */
export function eventShareImagePath(slug: string, preview: EventSharePreview): string {
  return `/e/${slug}/og?v=${sharePreviewVersion(preview)}`;
}
