import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A big, tappable radio choice with a title, a line of explanation and an
 * optional trailing value — the RSVP payment choice ("Wallet · €34.00").
 * Real `<input type="radio">` underneath, so grouping by `name`, arrow-key
 * navigation and screen readers all work.
 */
export interface OptionCardProps {
  /** Radio group name — cards with the same name are mutually exclusive. */
  name: string;
  value: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description?: ReactNode;
  /** Shown at the end, e.g. a balance or a fee. */
  trailing?: ReactNode;
  disabled?: boolean;
}

export function OptionCard({ name, value, checked, onChange, title, description, trailing, disabled }: OptionCardProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border-[1.5px] p-4 transition-colors",
        checked ? "border-2 border-accent-default bg-accent-subtle" : "border-border-default bg-bg-surface",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "grid size-[22px] shrink-0 place-items-center rounded-full border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-border-focus",
          checked ? "border-accent-default bg-accent-default" : "border-border-strong",
        )}
      >
        {checked && <span className="size-2 rounded-full bg-bg-surface" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-strong text-text-primary">{title}</span>
        {description && <span className="block text-small text-text-secondary">{description}</span>}
      </span>
      {trailing && <span className="shrink-0 text-small-strong text-text-primary">{trailing}</span>}
    </label>
  );
}
