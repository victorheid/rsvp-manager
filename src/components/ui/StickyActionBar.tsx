import type { ReactNode } from "react";

/**
 * The bar pinned to the bottom of a screen holding its one primary action
 * and a single line of context saying what it will do — "Nothing charged
 * now · drop out free until Wed 19:00" (UI spec §2). The primary action
 * sits in the bottom third of the screen, where a thumb reaches it.
 *
 * Put a `Button size="lg" fullWidth` in `children`. Pass it to `Screen` as
 * `actionBar` so it sticks to the bottom of the viewport.
 */
export interface StickyActionBarProps {
  /** One line under/over the button. */
  context?: ReactNode;
  children: ReactNode;
}

export function StickyActionBar({ context, children }: StickyActionBarProps) {
  return (
    <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-border-default bg-bg-surface px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-sheet">
      {context && <p className="text-center text-caption font-normal text-text-secondary">{context}</p>}
      {children}
    </div>
  );
}
