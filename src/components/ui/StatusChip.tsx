import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A small status label with a colour dot. The text is the message; the
 * colour only reinforces it (status is never by colour alone, UI spec §1,
 * principle 6). Use the vocabulary in UI spec §11 ("Open", "Game on",
 * "Didn't go ahead"…), never internal enum names.
 */
export type ChipTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONES: Record<ChipTone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-bg-subtle text-text-secondary", dot: "bg-text-secondary" },
  accent: { chip: "bg-accent-subtle text-accent-subtle-text", dot: "bg-accent-subtle-text" },
  success: { chip: "bg-success-bg text-success-fg", dot: "bg-success-fg" },
  warning: { chip: "bg-warning-bg text-warning-fg", dot: "bg-warning-fg" },
  danger: { chip: "bg-danger-bg text-danger-fg", dot: "bg-danger-fg" },
  info: { chip: "bg-info-bg text-info-fg", dot: "bg-info-fg" },
};

export interface StatusChipProps {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}

export function StatusChip({ tone = "neutral", children, className }: StatusChipProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-caption", t.chip, className)}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />
      {children}
    </span>
  );
}
