import Link from "next/link";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

/**
 * Bottom navigation for signed-in mobile use: Games, Wallet, Me (UI spec
 * §2). Not mounted yet — Wallet is blocked on the legal check and `/me`
 * doesn't exist — but it's ready: pass only the destinations that do.
 * Never show it on signed-out or shared-link pages (nothing should compete
 * with the event).
 */
export interface TabBarItem {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
}

export function TabBar({ items }: { items: readonly TabBarItem[] }) {
  return (
    <nav
      aria-label="Main"
      className="sticky bottom-0 z-20 flex border-t border-border-default bg-bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "flex h-[72px] flex-1 flex-col items-center justify-center gap-0.5 text-caption",
            item.active ? "text-accent-subtle-text" : "text-text-tertiary",
          )}
        >
          <Icon name={item.icon} className={item.active ? "text-accent-default" : undefined} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
