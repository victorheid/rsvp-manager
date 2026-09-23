"use client";

import type { ReactNode } from "react";
import { Banner, type BannerTone } from "./Banner";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";

/**
 * "Show consequences before irreversible actions" (UI spec §1, principle
 * 4) as one reusable sheet: a title, a banner that says exactly what will
 * happen, the commit button and a way out.
 *
 * The commit button says the outcome ("Remove Aoife M.", "Cancel game"),
 * not "OK". Use `tone="destructive"` when the action can't be undone or
 * affects other people; the way out is always "Keep…"-style secondary.
 *
 * It only reports errors and pending state — running the action and
 * closing the sheet is up to the caller.
 */
export interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** The consequence, e.g. { tone: "warning", title: "Aoife paid €8.00", body: "…" }. */
  banner?: { tone: BannerTone; title: string; body?: ReactNode };
  /** Extra content between the banner and the buttons (e.g. a choice). */
  children?: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** Disables the commit button, e.g. when the action isn't allowed yet. Say why in the banner. */
  confirmDisabled?: boolean;
  tone?: "default" | "destructive";
  /** Label of the way out. Default "Not now". */
  cancelLabel?: string;
  pending?: boolean;
  /** Shown above the buttons when the action failed. */
  error?: string;
}

export function ConfirmSheet({
  open,
  onClose,
  title,
  banner,
  children,
  confirmLabel,
  onConfirm,
  confirmDisabled = false,
  tone = "default",
  cancelLabel = "Not now",
  pending = false,
  error,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      {banner && (
        <Banner tone={banner.tone} title={banner.title}>
          {banner.body}
        </Banner>
      )}
      {children}
      {error && (
        <p role="alert" className="text-small text-danger-fg">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          fullWidth
          variant={tone === "destructive" ? "destructive" : "primary"}
          loading={pending}
          disabled={confirmDisabled}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button size="lg" fullWidth variant="secondary" disabled={pending} onClick={onClose}>
          {cancelLabel}
        </Button>
      </div>
    </BottomSheet>
  );
}
