import type { ReactNode } from "react";
import { Avatar } from "./Avatar";

/**
 * A person in a public list ("Who's in"): avatar, name, and an optional tag
 * or position ("Organizer", "#2"). Players only ever see "First L." (§4).
 * For the organizer's working list use `PersonManageRow` instead.
 */
export interface PersonRowProps {
  name: string;
  /** A `StatusChip` or short text at the end. */
  trailing?: ReactNode;
}

export function PersonRow({ name, trailing }: PersonRowProps) {
  return (
    <div className="flex items-center gap-3 px-1 py-2">
      <Avatar name={name} />
      <span className="min-w-0 flex-1 truncate text-body-strong text-text-primary">{name}</span>
      {trailing && <span className="shrink-0 text-small-strong text-text-secondary">{trailing}</span>}
    </div>
  );
}
