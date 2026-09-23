"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * A modal panel: slides up from the bottom on a phone, centres as a dialog
 * from `sm` up (UI spec §2, "Shared UI patterns"). Every multi-step flow
 * started from a page — RSVP, sign-in, confirm, cancel, remove, add
 * walk-in — lives in one, so closing it always returns to the page
 * underneath.
 *
 * Built on the native `<dialog>`, which gives focus trapping, Esc to
 * close, an inert page behind and focus restore for free. Children are only
 * mounted while open, so a sheet's local state resets each time it opens.
 *
 * Controlled: you own `open`, and `onClose` fires for Esc, the ✕ button and
 * a tap on the dimmed background.
 */
export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click that lands on the <dialog> itself (not its content) is a click on the backdrop.
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-xl bg-bg-surface p-0 text-text-primary shadow-sheet backdrop:bg-bg-overlay/55 sm:inset-auto sm:m-auto sm:max-w-md sm:rounded-xl"
    >
      {open && (
        <div className="flex flex-col gap-4 px-4 pb-6 pt-2">
          <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border-strong sm:hidden" />
          <div className="flex items-start gap-2">
            <h2 id={titleId} className="flex-1 text-title text-text-primary">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="grid size-9 shrink-0 place-items-center rounded-full bg-bg-subtle text-text-primary"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
