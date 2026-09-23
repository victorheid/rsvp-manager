"use client";

import Link from "next/link";
import {
  ActionMenu,
  Avatar,
  Button,
  EmptyState,
  EventCard,
  ICON_BUTTON_CLASS,
  Icon,
  Screen,
  ScreenSkeleton,
  SectionHeader,
  StatusChip,
  TopBar,
} from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { formatDateTime } from "@/lib/format";
import { eventChip } from "@/app/_components/eventPhase";
import { eventPriceText } from "@/app/_components/eventPrice";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

/** UI spec §6: signed-in "Games" home, or a short signed-out landing. */
export default function HomePage() {
  const utils = trpc.useUtils();
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery();
  const { data: upcoming } = trpc.rsvps.myUpcoming.useQuery(undefined, { enabled: !!me });
  const { data: groups } = trpc.groups.mine.useQuery(undefined, { enabled: !!me });
  const { requireAuth, signInSheetProps } = useRequireAuth();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => utils.invalidate() });

  if (meLoading) {
    return <ScreenSkeleton />;
  }

  if (!me) {
    return (
      <Screen
        topBar={
          <TopBar
            brand
            actions={
              <Button variant="ghost" onClick={() => requireAuth(() => {})}>
                Sign in
              </Button>
            }
          />
        }
        className="justify-center gap-6"
      >
        <div className="flex flex-col gap-3">
          <h2 className="text-display text-text-primary">Games with your group, sorted.</h2>
          <p className="text-body text-text-secondary">
            Post a game, share the link, and see who’s in — and who’s paid and who didn’t show.
          </p>
        </div>
        <Button href="/groups/new" size="lg" fullWidth>
          Create a group
        </Button>
        <p className="text-center text-small text-text-secondary">Got a link from your group? Just open it.</p>
        <SignInSheet {...signInSheetProps} />
      </Screen>
    );
  }

  const now = new Date();

  return (
    <Screen
      topBar={
        <TopBar
          brand
          actions={
            <ActionMenu
              label="Account"
              items={[{ label: "Sign out", description: "You can sign back in with a text code.", onSelect: () => logout.mutate() }]}
              triggerClassName={ICON_BUTTON_CLASS}
            >
              <Icon name="user" />
            </ActionMenu>
          }
        />
      }
      className="gap-6"
    >
      <h2 className="text-display text-text-primary">Your games</h2>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Upcoming" />
        {upcoming?.length === 0 && (
          <EmptyState
            icon="calendar"
            title="No games yet"
            description="Games you join show up here. Got a link from your group? Open it to join."
          />
        )}
        {upcoming?.map((rsvp) => (
          <EventCard
            key={rsvp.id}
            href={`/e/${rsvp.event.slug}`}
            when={`${formatDateTime(new Date(rsvp.event.startsAt))} · ${rsvp.event.group.name}`}
            title={rsvp.event.title}
            status={eventChip(rsvp.event, now)}
            headcount={rsvp.event.location}
            price={eventPriceText(rsvp.event)}
            mine={{ label: "You’re in", tone: "success" }}
          />
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeader title="Your groups" action={{ label: "Create a group", href: "/groups/new" }} />
        {groups?.map((group) => (
          <Link
            key={group.id}
            href={`/g/${group.slug}`}
            className="flex items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-3 hover:bg-bg-subtle"
          >
            <Avatar name={group.name} size="lg" />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-body-strong text-text-primary">
                {group.name}
                {group.organizerId === me.id && <StatusChip tone="accent">Organizer</StatusChip>}
              </span>
            </span>
            <Icon name="chevron-right" className="text-text-tertiary" />
          </Link>
        ))}
        {groups?.length === 0 && (
          <EmptyState
            icon="users"
            title="No groups yet"
            description="Running a game? Create a group and share its link."
            action={<Button href="/groups/new">Create a group</Button>}
          />
        )}
      </section>
    </Screen>
  );
}
