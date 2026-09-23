import { cn } from "./cn";

/**
 * Pick exactly one of two or three short options, all visible at once:
 * "Fixed per person | Split the cost", "Paid cash | Owes". For longer
 * lists use OptionCard. Built as a radio group, so it's keyboard- and
 * screen-reader-friendly.
 */
export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Pricing mode". */
  label: string;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("flex gap-1 rounded-full bg-bg-subtle p-1", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 flex-1 rounded-full px-3 transition-colors",
              selected ? "bg-bg-surface text-small-strong text-text-primary shadow-sm" : "text-small text-text-secondary",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
