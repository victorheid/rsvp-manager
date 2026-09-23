import Link from "next/link";
import { StatusChip, type ChipTone } from "./StatusChip";

/**
 * A game in a list — on Home, the group page, anywhere games are listed.
 * The whole card is a link to the event. Shows when, what, the game's
 * status and, if the viewer is involved, their own status ("You're in",
 * "Waitlist #2") so "am I in / have I paid?" is answered without opening
 * anything (UI spec §1).
 */
export interface EventCardProps {
  href: string;
  /** "THU 25 SEP · 19:00". Shown small, above the title. */
  when: string;
  title: string;
  status: { label: string; tone: ChipTone };
  /** "8/12 in" */
  headcount: string;
  /** "€8.00 each" */
  price: string;
  /** The viewer's own status, if they're involved. */
  mine?: { label: string; tone: ChipTone };
}

export function EventCard({ href, when, title, status, headcount, price, mine }: EventCardProps) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm transition-colors hover:bg-bg-subtle"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-caption uppercase text-text-tertiary">{when}</p>
          <p className="text-heading text-text-primary">{title}</p>
        </div>
        <StatusChip tone={status.tone}>{status.label}</StatusChip>
      </div>
      <p className="flex items-center gap-2 text-small text-text-secondary">
        <span>{headcount}</span>
        <span aria-hidden>·</span>
        <span className="text-small-strong text-text-primary">{price}</span>
      </p>
      {mine && (
        <div>
          <StatusChip tone={mine.tone}>{mine.label}</StatusChip>
        </div>
      )}
    </Link>
  );
}
