import Link from "next/link";
import type { ReactNode } from "react";
import { IconButton } from "./IconButton";

/**
 * The bar at the top of every screen (UI spec §2, Navigation).
 *
 *  - `brand`: the app name on the left — for top-level screens (Home).
 *  - `backHref` + `title`: a back chevron and a centred title — for
 *    everything below the top level (event → group → Games).
 *
 * `actions` is the right-hand slot: at most one or two icon buttons
 * (`IconButton`, or an `ActionMenu` with a ••• trigger) or a "Sign in" text
 * button. Stays fixed to the top while the page scrolls.
 */
export interface TopBarProps {
  brand?: boolean;
  backHref?: string;
  title?: string;
  actions?: ReactNode;
}

export const APP_NAME = "RSVP Manager";

export function TopBar({ brand = false, backHref, title, actions }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-1 bg-bg-canvas px-2">
      {backHref !== undefined && <IconButton icon="chevron-left" label="Back" href={backHref} />}
      {brand && (
        <Link href="/" className="flex items-center gap-2 pl-2 text-heading text-text-primary">
          <span aria-hidden className="size-5 rounded-full bg-accent-default" />
          {APP_NAME}
        </Link>
      )}
      {title ? (
        <h1 className="min-w-0 flex-1 truncate text-center text-body-strong text-text-primary">{title}</h1>
      ) : (
        <div className="flex-1" />
      )}
      {actions ?? (backHref !== undefined ? <div className="size-11" aria-hidden /> : null)}
    </header>
  );
}
