import { Banner } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { eventPhase } from "@/server/domains/events/rules";

type Event = RouterOutputs["events"]["getBySlug"];

/** What a player would pay: the flat or locked price, or the top of the range while it's still open. */
export function expectedPriceCents(event: Event): number {
  return event.priceDisplay.mode === "range" ? event.priceDisplay.maxCents : event.priceDisplay.amountCents;
}

/**
 * "Is it on?" (UI spec §4.1, item 4): the confirmation rule in plain
 * words, changing with the game's state. Never the word "cut-off".
 */
export function IsItOnBanner({ event, now }: { event: Event; now: Date }) {
  const phase = eventPhase(event, now);
  // Walk-ins count toward the minimum (the server checks every going RSVP), just not the max.
  const needed = Math.max(0, event.minPlayers - event.rsvps.length);

  switch (phase) {
    case "OPEN":
      if (!event.autoChargeAtCutoff) {
        return (
          <Banner tone="info" title="The organizer will confirm this game.">
            You can drop out for free until they do.
          </Banner>
        );
      }
      if (now >= event.cutoffAt) {
        return (
          <Banner tone="info" title={needed > 0 ? `Not confirmed yet — needs ${needed} more.` : "Not confirmed yet."}>
            You can still drop out for free.
          </Banner>
        );
      }
      return (
        <Banner tone="info" title={`Confirms ${formatDateTime(new Date(event.cutoffAt))} if ${event.minPlayers} or more are in.`}>
          Until then you can drop out for free.
        </Banner>
      );
    case "CONFIRMED":
      return (
        <Banner tone="success" title="Game on.">
          {event.confirmedAt ? `Confirmed ${formatDateTime(new Date(event.confirmedAt))}. ` : ""}
          Joining now means paying the price. If you drop out after that, a refund is up to the organizer.
        </Banner>
      );
    case "LIVE":
      return <Banner tone="info" title="This game has started." />;
    case "FINISHED":
      return <Banner tone="info" title="This game has finished." />;
    case "CANCELLED":
      return <Banner tone="danger" title="Cancelled by the organizer." />;
    case "EXPIRED":
      return <Banner tone="info" title="This game didn’t go ahead.">Nobody was charged.</Banner>;
  }
}
