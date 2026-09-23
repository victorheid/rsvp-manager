"use client";

import { TabBar } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";

/**
 * The signed-in bottom navigation (UI spec §2): Games, Wallet, Me. Wallet
 * only appears while the wallet is switched on. Shown on the three top-level
 * screens, never on a game's page — nothing competes with the event.
 */
export function MainTabBar({ active }: { active: "games" | "wallet" | "me" }) {
  const { data: wallet } = trpc.wallet.summary.useQuery();

  return (
    <TabBar
      items={[
        { href: "/", label: "Games", icon: "calendar", active: active === "games" },
        ...(wallet?.enabled ? [{ href: "/wallet", label: "Wallet", icon: "wallet" as const, active: active === "wallet" }] : []),
        { href: "/me", label: "Me", icon: "user", active: active === "me" },
      ]}
    />
  );
}
