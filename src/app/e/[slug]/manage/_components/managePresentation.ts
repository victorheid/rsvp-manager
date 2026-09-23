import type { ManageRowTone } from "@/components/ui";
import { formatCents, formatPlayerName } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import type { EventPhase } from "@/server/domains/events";

export type OrganizerRsvp = RouterOutputs["rsvps"]["forOrganizer"]["rsvps"][number];

/** Who this row is: a player's "First L.", or a walk-in's typed name. */
export function personName(rsvp: Pick<OrganizerRsvp, "user" | "walkInName">): string {
  if (rsvp.user) return formatPlayerName(rsvp.user);
  return rsvp.walkInName ?? "Walk-in";
}

/**
 * The one status line under a person's name (UI spec §10.5) and how loudly
 * to say it. Rows are informational, so this line is what tells the
 * organizer who needs attention:
 *
 *   danger  — owes money, or was a no-show
 *   warning — cash still to collect, once the game has started
 *   neutral — everything is fine (paid, held, cash on the day)
 */
export function personDetail(input: {
  rsvp: Pick<OrganizerRsvp, "status" | "paymentStatus" | "paymentMethod" | "attended" | "userId" | "walkInName" | "noShowCount">;
  phase: EventPhase;
  isOrganizersOwnRsvp: boolean;
  amountCents: number;
}): { text: string; tone: ManageRowTone } {
  const { rsvp, phase, isOrganizersOwnRsvp, amountCents } = input;
  const amount = formatCents(amountCents);
  const gameStarted = phase === "LIVE" || phase === "FINISHED";
  const isGoing = rsvp.status === "GOING";
  const wasNoShow = isGoing && rsvp.attended === false;

  let payment: string;
  let paymentTone: ManageRowTone = "neutral";

  switch (rsvp.paymentStatus) {
    case "PENDING":
      if (rsvp.paymentMethod === "CASH") {
        payment = gameStarted ? `Cash · ${amount} to collect` : "Cash on the day";
        // The organizer's own cash isn't something to chase.
        paymentTone = gameStarted && isGoing && !isOrganizersOwnRsvp ? "warning" : "neutral";
      } else {
        payment = "Payment pending";
      }
      break;
    case "HELD":
      payment = `Held · ${amount}`;
      break;
    case "CHARGED":
      payment = `Paid online · ${amount}`;
      break;
    case "OWES":
      payment = `Owes ${amount}`;
      paymentTone = "danger";
      break;
    case "PAID_OUTSIDE_APP":
      payment = `Paid outside app · ${amount}`;
      break;
    case "REFUNDED":
      payment = `Refunded · ${amount}`;
      break;
  }

  const parts: string[] = [];
  if (!isGoing) parts.push("Dropped out");
  if (wasNoShow) parts.push("No-show");
  if (isOrganizersOwnRsvp) parts.push("Organizer");
  if (rsvp.userId === null) parts.push("Walk-in");
  parts.push(payment);
  // The group's no-show count includes this game, so don't repeat it on the row that was just marked.
  const pastNoShows = rsvp.noShowCount - (wasNoShow ? 1 : 0);
  if (pastNoShows > 0) {
    parts.push(`${pastNoShows} past ${pastNoShows === 1 ? "no-show" : "no-shows"}`);
  }

  return { text: parts.join(" · "), tone: wasNoShow ? "danger" : paymentTone };
}

/** Which filter chips a row belongs to. */
export type ManageFilter = "ALL" | "OWES" | "CASH" | "NO_SHOWS";

export function matchesFilter(
  rsvp: Pick<OrganizerRsvp, "status" | "paymentStatus" | "paymentMethod" | "attended">,
  filter: ManageFilter,
): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "OWES":
      return rsvp.paymentStatus === "OWES";
    case "CASH":
      return rsvp.paymentStatus === "PENDING" && rsvp.paymentMethod === "CASH";
    case "NO_SHOWS":
      return rsvp.status === "GOING" && rsvp.attended === false;
  }
}

/**
 * Problems first: people who owe, then people whose cash is still to
 * collect, then no-shows, then everyone else in join order. Stable, so the
 * list doesn't jump around when something is marked.
 */
export function attentionRank(
  rsvp: Pick<OrganizerRsvp, "paymentStatus" | "paymentMethod" | "attended">,
  phase: EventPhase,
): number {
  if (rsvp.paymentStatus === "OWES") return 0;
  if (rsvp.paymentStatus === "PENDING" && rsvp.paymentMethod === "CASH" && (phase === "LIVE" || phase === "FINISHED")) return 1;
  return 2;
}
