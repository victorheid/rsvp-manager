import { cn } from "./cn";
import { Screen } from "./Screen";
import { TopBar } from "./TopBar";

/**
 * Loading placeholders — never a blank page or a bare "Loading…" on a slow
 * connection at a sports hall (UI spec §2). `Skeleton` is one grey block;
 * `SectionSkeleton` is a few card-height rows for one section whose data is
 * still loading while the rest of the page is already there; `ScreenSkeleton`
 * is a whole page's worth, used while a screen's first query is in flight.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-bg-subtle", className)} />;
}

export function SectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-16 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function ScreenSkeleton({ backHref }: { backHref?: string }) {
  return (
    <Screen topBar={<TopBar brand={backHref === undefined} backHref={backHref} />}>
      <div role="status" aria-label="Loading" className="flex flex-col gap-5">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </Screen>
  );
}
