"use client";

import { Banner, Button, EmptyState, Screen, ScreenSkeleton, SectionHeader, TopBar, useToast } from "@/components/ui";
import { MainTabBar } from "@/app/_components/MainTabBar";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { usePushNotifications } from "@/app/_components/usePushNotifications";
import { useRequireAuth } from "@/app/_components/useRequireAuth";
import { trpc } from "@/lib/trpc/client";

const PUSH_STATUS_TEXT = {
  loading: "Checking…",
  unsupported: "Not supported on this device",
  denied: "Blocked in your browser settings",
  off: "Off",
  on: "On",
} as const;

/** UI spec §9.1: account and notification settings. */
export default function MePage() {
  const toast = useToast();
  const utils = trpc.useUtils();
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const push = usePushNotifications();
  const sendTest = trpc.notifications.sendTest.useMutation({ onSuccess: () => toast({ message: "Test sent" }) });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => utils.invalidate() });
  const { isLoading } = trpc.auth.me.useQuery();

  const topBar = <TopBar brand />;

  if (isLoading) {
    return <ScreenSkeleton />;
  }

  if (!me) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="user" title="Sign in to manage your account" action={<Button onClick={() => requireAuth(() => {})}>Sign in</Button>} />
        <SignInSheet {...signInSheetProps} />
      </Screen>
    );
  }

  return (
    <Screen topBar={topBar} actionBar={<MainTabBar active="me" />} className="gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-display text-text-primary">Me</h2>
        <p className="text-body text-text-secondary">{me.phoneNumber}</p>
      </div>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Notifications" />
        <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-surface p-4">
          <span className="text-body text-text-primary">Push notifications</span>
          <span className="text-body-strong text-text-secondary">{PUSH_STATUS_TEXT[push.status]}</span>
        </div>
        {push.status === "off" && <Button onClick={() => void push.enable()}>Turn on</Button>}
        {push.status === "on" && (
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" loading={sendTest.isPending} onClick={() => sendTest.mutate()}>
              Send test
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => void push.disable()}>
              Turn off
            </Button>
          </div>
        )}
        {push.status === "unsupported" && (
          <Banner tone="info" title="Push isn’t available here">
            On iPhone, add this app to your Home Screen first. Important payment messages also come by text.
          </Banner>
        )}
        <p className="text-small text-text-secondary">Important payment messages also come by text.</p>
      </section>

      <Button variant="secondary" fullWidth loading={logout.isPending} onClick={() => logout.mutate()}>
        Sign out
      </Button>
    </Screen>
  );
}
