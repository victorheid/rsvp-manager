import { cn } from "./cn";

/**
 * "Is it on?" at a glance: how many are in, what's needed, and a progress
 * bar with a marker where the minimum is. The bar is accent-coloured until
 * the minimum is met, then green (UI spec §4.1, item 5).
 *
 * `countLabel` and `note` let the manage screen reuse it once the game has
 * started ("7 came · 1 no-show") without a second component.
 */
export interface HeadcountBarProps {
  count: number;
  min: number;
  /** `null` means no limit. */
  max: number | null;
  /** Word after the count. Default "in". */
  countLabel?: string;
  /** Replaces the "N spots left" text on the right. */
  note?: string;
}

export function HeadcountBar({ count, min, max, countLabel = "in", note }: HeadcountBarProps) {
  // Without a max the bar has no natural end; give it room to grow past the minimum.
  const scale = max ?? Math.max(min * 2, count, 1);
  const fillPercent = Math.min(100, (count / scale) * 100);
  const markerPercent = Math.min(100, (min / scale) * 100);
  const spotsLeft = max === null ? null : Math.max(0, max - count);
  const right = note ?? (spotsLeft === null ? null : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="text-number text-text-primary">
          {count} {countLabel}
        </span>
        <span className="flex-1 text-small text-text-secondary">
          needs {min} · {max === null ? "no limit" : `${max} max`}
        </span>
        {right && <span className="text-small-strong text-text-primary">{right}</span>}
      </div>
      <div
        role="progressbar"
        aria-label={`${count} of ${max ?? "unlimited"} spots filled, minimum ${min}`}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={Math.min(count, scale)}
        className="relative h-[18px]"
      >
        <div className="absolute inset-x-0 top-1 h-2.5 rounded-full bg-bg-subtle" />
        <div
          className={cn(
            "absolute left-0 top-1 h-2.5 rounded-full",
            count >= min ? "bg-success-solid" : "bg-accent-default",
          )}
          style={{ width: `${fillPercent}%` }}
        />
        <div
          className="absolute top-0 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-text-primary"
          style={{ left: `${markerPercent}%` }}
        />
      </div>
    </div>
  );
}
