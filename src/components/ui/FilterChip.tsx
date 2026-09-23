import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A toggleable filter pill that also shows a count: "Owes · 1". Use a row
 * of them to narrow a list; the selected one is filled with the accent.
 * Hide chips whose count is zero rather than showing dead filters.
 */
export interface FilterChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

export function FilterChip({ selected, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-10 shrink-0 rounded-full px-4 text-small-strong transition-colors",
        selected
          ? "border-2 border-accent-default bg-accent-subtle text-accent-subtle-text"
          : "border-[1.5px] border-border-strong bg-bg-surface text-text-secondary",
      )}
    >
      {children}
    </button>
  );
}
