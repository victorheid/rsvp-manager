import type { ReactNode } from "react";

/**
 * The bar pinned to the bottom of a screen holding its one primary action
 * and a single line of context saying what it will do — "Nothing charged
 * now · drop out free until Wed 19:00" (UI spec §2). The primary action
 * sits in the bottom third of the screen, where a thumb reaches it.
 *
 * On the event page it also carries the viewer's own status (`status`):
 * "You're in · €8.00 held", "A spot is yours · held until 21:00", with at
 * most one secondary link ("Leave waitlist"). Everything about "you" lives
 * here, next to what you can do about it, so the page stays about the game.
 *
 * Put a `Button size="lg" fullWidth` in `children`. Pass it to `Screen` as
 * `actionBar` so it sticks to the bottom of the viewport.
 */
export interface StickyActionBarProps {
  /** The viewer's status: a short title and one line of detail. */
  status?: { title: ReactNode; detail?: ReactNode };
  /** One secondary action next to the status, e.g. a "Leave waitlist" link button. */
  secondaryAction?: ReactNode;
  /** One line over the button. Leave it out when `status` already says it. */
  context?: ReactNode;
  children: ReactNode;
}

export function StickyActionBar({ status, secondaryAction, context, children }: StickyActionBarProps) {
  return (
    <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-border-default bg-bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet">
      {status && (
        <div className="flex items-start gap-3" role="status">
          <div className="min-w-0 flex-1">
            <p className="text-body-strong text-text-primary">{status.title}</p>
            {status.detail && <p className="text-small text-text-secondary">{status.detail}</p>}
          </div>
          {secondaryAction && <div className="shrink-0 text-small-strong text-text-link">{secondaryAction}</div>}
        </div>
      )}
      {context && <p className="text-center text-caption font-normal text-text-secondary">{context}</p>}
      {children}
    </div>
  );
}
