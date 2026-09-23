import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A labelled on/off switch: "Accept cash on the day", "Confirm
 * automatically at the cut-off". Say what *on* does in the label and what
 * *off* does in the description — the switch itself carries no other text.
 */
export interface ToggleRowProps {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-body-strong text-text-primary">{label}</p>
        {description && <p className="text-small text-text-secondary">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60",
          checked ? "bg-accent-default" : "bg-border-strong",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-1 size-6 rounded-full bg-bg-surface shadow-sm transition-[left]",
            checked ? "left-7" : "left-1",
          )}
        />
      </button>
    </div>
  );
}
