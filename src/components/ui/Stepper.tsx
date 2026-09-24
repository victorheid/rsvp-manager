import { Icon } from "./Icon";

/**
 * A whole number with − and + buttons — for small counts like min/max
 * players where typing is slower than tapping. Both buttons are 44px.
 * With `format`, it steps through a short list instead ("30m", "1h",
 * "2h"…): `value` is then the index into that list.
 */
export interface StepperProps {
  label: string;
  /** One line under the label saying what the number does. */
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** How to show the value, e.g. an index into a list of options. */
  format?: (value: number) => string;
}

export function Stepper({ label, hint, value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, format }: StepperProps) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-body-strong text-text-primary">{label}</p>
        {hint && <p className="text-caption font-normal text-text-secondary">{hint}</p>}
      </div>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="grid size-11 place-items-center rounded-full border-[1.5px] border-border-strong bg-bg-surface text-text-primary disabled:text-text-tertiary"
      >
        <Icon name="minus" size={20} />
      </button>
      <output aria-live="polite" className="min-w-8 text-center text-heading text-text-primary">
        {format ? format(value) : value}
      </output>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="grid size-11 place-items-center rounded-full border-[1.5px] border-border-strong bg-bg-surface text-text-primary disabled:text-text-tertiary"
      >
        <Icon name="plus" size={20} />
      </button>
    </div>
  );
}
