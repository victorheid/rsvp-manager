"use client";

import { Banner, Button, EmptyState, Screen, ScreenSkeleton, SectionHeader, TopBar, useToast } from "@/components/ui";
import { useState } from "react";
import { ChangePhoneSheet } from "@/app/_components/ChangePhoneSheet";
import { VerifyEmailSheet } from "@/app/_components/VerifyEmailSheet";
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
  const { data: account } = trpc.auth.account.useQuery(undefined, { enabled: !!me });
  const [emailOpen, setEmailOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);

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
      <h2 className="text-display text-text-primary">Me</h2>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Sign-in" />
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <div className="min-w-0">
            <p className="text-caption text-text-tertiary">PHONE</p>
            <p className="text-body text-text-primary">{me.phoneNumber}</p>
          </div>
          <Button variant="secondary" onClick={() => setPhoneOpen(true)}>
            Change
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <div className="min-w-0">
            <p className="text-caption text-text-tertiary">EMAIL</p>
            <p className="truncate text-body text-text-primary">{account?.emailVerified ? account.email : "Not added"}</p>
          </div>
          <Button variant="secondary" onClick={() => setEmailOpen(true)}>
            {account?.emailVerified ? "Change" : "Add"}
          </Button>
        </div>
        {!account?.emailVerified && (
          <p className="text-small text-text-secondary">You only need an email if you organize games. It helps you get back in if you change or lose your number.</p>
        )}
      </section>

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

      <VerifyEmailSheet
        open={emailOpen}
        onClose={() => setEmailOpen(false)}
        onVerified={() => {
          setEmailOpen(false);
          toast({ message: "Email verified" });
        }}
      />
      <ChangePhoneSheet
        open={phoneOpen}
        onClose={() => setPhoneOpen(false)}
        onChanged={() => {
          setPhoneOpen(false);
          toast({ message: "Phone number changed" });
        }}
      />
    </Screen>
  );
}
