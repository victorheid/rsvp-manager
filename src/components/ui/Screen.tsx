import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The page shell every screen uses: a phone-width column (wider layouts
 * are the same screen, centred — UI spec §12), a `TopBar` at the top, the
 * content in the middle with consistent spacing, and an optional
 * `StickyActionBar` at the bottom.
 *
 *     <Screen topBar={<TopBar backHref="/" title="Group" />} actionBar={<StickyActionBar>…</StickyActionBar>}>
 *       …sections…
 *     </Screen>
 */
export interface ScreenProps {
  topBar?: ReactNode;
  actionBar?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Screen({ topBar, actionBar, children, className }: ScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-1 flex-col">
      {topBar}
      <main className={cn("flex flex-1 flex-col gap-5 px-4 pb-8 pt-2", className)}>{children}</main>
      {actionBar}
    </div>
  );
}
