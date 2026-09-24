import { Button, StickyActionBar } from "@/components/ui";
import { formatCents, formatTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { countsTowardMax, eventPhase, hasCapacity } from "@/server/domains/events/rules";
import { expectedPriceCents } from "./EventStatusBanners";

type Event = RouterOutputs["events"]["getBySlug"];

export interface ViewerActionBarProps {
  event: Event;
  now: Date;
  onJoin: () => void;
  onJoinWaitlist: () => void;
  onLeaveWaitlist: () => void;
  onDropOut: () => void;
  joiningWaitlist: boolean;
  leavingWaitlist: boolean;
}

/** "1 hour", "30 minutes", "12 hours". */
function holdText(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/**
 * The bottom bar of the event page (UI spec §4.1 item 2, §4.2): the
 * viewer's own status — in, on the waitlist and where, a spot held for
 * them and until when, dropped out — next to the one thing they can do
 * about it. The page body stays about the game.
 */
export function ViewerActionBar(props: ViewerActionBarProps) {
  const { event, now } = props;
  const phase = eventPhase(event, now);

  if (phase !== "OPEN" && phase !== "CONFIRMED") {
    return null;
  }

  const price = formatCents(expectedPriceCents(event));
  const charge = phase === "OPEN" ? "Nothing charged now." : `Taking it charges ${price}.`;
  const players = event.rsvps.filter(countsTowardMax).length;
  const waitlist = event.viewerWaitlist;
  const leaveLink = (
    <button type="button" onClick={props.onLeaveWaitlist} disabled={props.leavingWaitlist}>
      Leave waitlist
    </button>
  );

  if (event.viewerRsvp?.status === "GOING") {
    const paying = event.viewerRsvp.paymentMethod === "CASH" ? `Paying ${price} cash on the day. ` : "";
    return (
      <StickyActionBar
        status={{
          title: "You’re in",
          detail: `${paying}${phase === "OPEN" ? "Drop out for free until the game is confirmed." : "If you drop out now, a refund is up to the organizer."}`,
        }}
      >
        <Button size="lg" fullWidth variant="secondary" onClick={props.onDropOut}>
          Can’t make it
        </Button>
      </StickyActionBar>
    );
  }

  if (waitlist?.heldUntil) {
    return (
      <StickyActionBar
        status={{
          title: "A spot is yours",
          detail: `Held for you until ${formatTime(new Date(waitlist.heldUntil))}, then it goes to the next person. ${charge}`,
        }}
        secondaryAction={leaveLink}
      >
        <Button size="lg" fullWidth onClick={props.onJoin}>
          Take the spot
        </Button>
      </StickyActionBar>
    );
  }

  if (waitlist?.spotOpen) {
    return (
      <StickyActionBar status={{ title: "A spot is open", detail: `First on the waitlist to take it gets it. ${charge}` }} secondaryAction={leaveLink}>
        <Button size="lg" fullWidth onClick={props.onJoin}>
          Take the spot
        </Button>
      </StickyActionBar>
    );
  }

  if (waitlist) {
    return (
      <StickyActionBar
        status={{
          title: waitlist.position === null ? "You’re on the waitlist" : `You’re #${waitlist.position} on the waitlist`,
          detail:
            event.waitlistMode === "IN_ORDER"
              ? `If a spot opens for you, it’s held for you for ${holdText(event.waitlistHoldMinutes)} and shows up here.`
              : "If a spot opens, the first on the waitlist to take it gets it.",
        }}
      >
        <Button size="lg" fullWidth variant="secondary" loading={props.leavingWaitlist} onClick={props.onLeaveWaitlist}>
          Leave waitlist
        </Button>
      </StickyActionBar>
    );
  }

  // Not in (or dropped out): join if there's room nobody holds, else the waitlist.
  const status = event.viewerRsvp?.status === "CANCELLED" ? { title: "You dropped out" } : undefined;

  if (!hasCapacity(event, players + event.spotsHeld)) {
    return (
      <StickyActionBar status={status} context={status ? undefined : "Nothing charged now · take a spot if one opens"}>
        <Button size="lg" fullWidth loading={props.joiningWaitlist} onClick={props.onJoinWaitlist}>
          Join waitlist
        </Button>
      </StickyActionBar>
    );
  }

  if (!event.cashAllowed && !event.onlineAllowed) {
    return null;
  }

  return (
    <StickyActionBar
      status={status}
      context={
        phase === "OPEN"
          ? "Nothing charged now · drop out free until it’s confirmed"
          : event.onlineAllowed
            ? `Pay ${price} when you join`
            : `Pay ${price} in cash on the day`
      }
    >
      <Button size="lg" fullWidth onClick={props.onJoin}>
        I’m in
      </Button>
    </StickyActionBar>
  );
}
