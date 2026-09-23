"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * Brief feedback after a completed action ("Marked as paid outside app"),
 * with an optional Undo. One toast at a time; a new one replaces the old.
 * Reversible record-keeping gets a toast with Undo instead of a
 * confirmation dialog (UI spec §2) — that's what makes the ••• menu safe
 * to tap.
 *
 * Mount `ToastProvider` once (the root layout does) and call
 * `useToast()` anywhere below it:
 *
 *     const toast = useToast();
 *     toast({ message: "Dara L. marked as no-show", actionLabel: "Undo", onAction: undo });
 */
export interface ToastOptions {
  message: string;
  /** `error` is for failures — it stays longer. */
  tone?: "default" | "error";
  actionLabel?: string;
  onAction?: () => void;
  /** How long it stays. Default 5s (8s for errors). */
  durationMs?: number;
}

type ShowToast = (options: ToastOptions) => void;

const ToastContext = createContext<ShowToast | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setToast(null);
  }, []);

  const show = useCallback<ShowToast>(
    (options) => {
      if (timer.current) clearTimeout(timer.current);
      nextId.current += 1;
      setToast({ ...options, id: nextId.current });
      timer.current = setTimeout(() => setToast(null), options.durationMs ?? (options.tone === "error" ? 8000 : 5000));
    },
    [],
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md justify-center">
        {toast && (
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className={cn(
              "pointer-events-auto flex w-full items-center gap-3 rounded-md px-4 py-3 text-text-on-overlay shadow-lg",
              toast.tone === "error" ? "bg-danger-solid" : "bg-bg-overlay",
            )}
          >
            <Icon name={toast.tone === "error" ? "alert" : "check"} size={20} className="shrink-0" />
            <p className="min-w-0 flex-1 text-small-strong">{toast.message}</p>
            {toast.actionLabel && (
              <button
                type="button"
                className="shrink-0 text-small-strong underline"
                onClick={() => {
                  toast.onAction?.();
                  dismiss();
                }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const show = useContext(ToastContext);
  if (!show) {
    throw new Error("useToast must be used inside <ToastProvider> (it's mounted in the root layout).");
  }
  return show;
}
