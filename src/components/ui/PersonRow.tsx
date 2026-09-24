import type { ReactNode } from "react";
import { cn } from "./cn";
import { Avatar } from "./Avatar";

/**
 * A person in a public list ("In", "Waitlist", "Dropped out"): avatar,
 * name, and an optional tag or position ("Organizer", "#2", "Held until
 * 21:00"). Players are shown by the name they signed up with (§4). The viewer's own row is
 * `highlighted`; people who dropped out are `muted`. For the organizer's
 * working list use `PersonManageRow` instead.
 */
export interface PersonRowProps {
  name: string;
  /** A `StatusChip` or short text at the end. */
  trailing?: ReactNode;
  /** The viewer's own row, wherever it is in the list. */
  highlighted?: boolean;
  /** Someone who dropped out. */
  muted?: boolean;
}

export function PersonRow({ name, trailing, highlighted = false, muted = false }: PersonRowProps) {
  return (
    <div className={cn("flex items-center gap-3 px-1 py-2", highlighted && "rounded-lg bg-bg-subtle px-3")}>
      <Avatar name={name} />
      <span className={cn("min-w-0 flex-1 truncate text-body-strong", muted ? "text-text-tertiary" : "text-text-primary")}>
        {name}
        {highlighted && " (you)"}
      </span>
      {trailing && <span className="shrink-0 text-small-strong text-text-secondary">{trailing}</span>}
    </div>
  );
}
