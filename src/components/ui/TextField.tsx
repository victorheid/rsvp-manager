"use client";

import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "./cn";

/**
 * Labelled text inputs. The label is always visible (no placeholder-only
 * fields, UI spec §13), the helper sits under the control, and an `error`
 * replaces the helper in the danger colour and is announced to screen
 * readers. Extra props (`type`, `inputMode`, `autoComplete`, `required`…)
 * go straight to the underlying element, so `type="date"`, `"time"` and
 * `"tel"` all work.
 */
interface FieldProps {
  label: string;
  helper?: ReactNode;
  error?: string;
}

const CONTROL =
  "w-full rounded-md border-[1.5px] bg-bg-surface px-4 text-body text-text-primary placeholder:text-text-tertiary " +
  "focus:border-2 focus:border-border-focus focus:outline-none disabled:bg-bg-subtle disabled:text-text-tertiary";

function controlClass(error: string | undefined, extra: string): string {
  return cn(CONTROL, error ? "border-danger-solid" : "border-border-strong", extra);
}

function FieldShell({
  id,
  label,
  helper,
  error,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  const message = error ?? helper;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-small-strong text-text-primary">
        {label}
      </label>
      {children}
      {message && (
        <p
          id={`${id}-message`}
          role={error ? "alert" : undefined}
          className={cn("text-caption", error ? "text-danger-fg" : "font-normal text-text-secondary")}
        >
          {message}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = FieldProps & Omit<ComponentPropsWithoutRef<"input">, "id" | keyof FieldProps>;

export function TextField({ label, helper, error, className, ...input }: TextFieldProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} helper={helper} error={error}>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? `${id}-message` : undefined}
        className={controlClass(error, cn("h-12", className))}
      />
    </FieldShell>
  );
}

export type TextAreaProps = FieldProps & Omit<ComponentPropsWithoutRef<"textarea">, "id" | keyof FieldProps>;

export function TextArea({ label, helper, error, className, ...textarea }: TextAreaProps) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} helper={helper} error={error}>
      <textarea
        {...textarea}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || helper ? `${id}-message` : undefined}
        className={controlClass(error, cn("min-h-24 py-3", className))}
      />
    </FieldShell>
  );
}
