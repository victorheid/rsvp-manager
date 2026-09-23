import { Banner } from "@/components/ui";
import { formatCents, formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { eventPhase } from "@/server/domains/events/rules";

type Event = RouterOutputs["events"]["getBySlug"];

/** What a player would pay: the flat or locked price, or the top of the range while it's still open. */
export function expectedPriceCents(event: Event): number {
  return event.priceDisplay.mode === "range" ? event.priceDisplay.maxCents : event.priceDisplay.amountCents;
}

/**
 * "Your status" (UI spec §4.1, item 2): am I in, on the waitlist, or out —
 * answered at the top of the page, with what it means for my money and
 * when I can still change my mind.
 */
export function ViewerStatusBanner({ event, now }: { event: Event; now: Date }) {
  const phase = eventPhase(event, now);
  const price = formatCents(expectedPriceCents(event));

  if (event.viewerRsvp?.status === "GOING") {
    const beforeConfirmation = phase === "OPEN";
    return (
      <Banner tone="success" title="You’re in">
        {event.viewerRsvp.paymentMethod === "CASH" && <>Paying {price} cash on the day. </>}
        {beforeConfirmation
          ? "Drop out for free until the game is confirmed."
          : phase === "CONFIRMED"
            ? "If you drop out now, a refund is up to the organizer."
            : null}
      </Banner>
    );
  }

  if (event.viewerWaitlistPosition !== null) {
    return (
      <Banner tone="warning" title={`You’re on the waitlist · #${event.viewerWaitlistPosition}`}>
        If a spot opens up, you can claim it here.
      </Banner>
    );
  }

  if (event.viewerRsvp?.status === "CANCELLED") {
    return <Banner tone="info" title="You dropped out" />;
  }

  return null;
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
