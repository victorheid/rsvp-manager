"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Button,
  EmptyState,
  EventCard,
  IconButton,
  Screen,
  ScreenSkeleton,
  SectionHeader,
  SharePreview,
  ShareSheet,
  StatusChip,
  TopBar,
} from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { formatDateTime } from "@/lib/format";
import type { RouterOutputs } from "@/lib/trpc/types";
import { eventChip } from "@/app/_components/eventPhase";
import { eventPriceText, headcountText } from "@/app/_components/eventPrice";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useOpenShareOnArrival } from "@/app/_components/useOpenShareOnArrival";
import { useOrigin } from "@/app/_components/useOrigin";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

type GroupEvent = RouterOutputs["groups"]["getBySlug"]["events"][number];

/** UI spec §5: the group's permanent link — upcoming games first, past ones tucked away. */
export default function GroupPage() {
  const { slug } = useParams<{ slug: string }>();
  const utils = trpc.useUtils();
  const origin = useOrigin();
  const { data: group, isLoading, error } = trpc.groups.getBySlug.useQuery({ slug });
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const { shareOpen, setShareOpen } = useOpenShareOnArrival();
  const [showPast, setShowPast] = useState(false);
  const [now] = useState(() => new Date());

  const join = trpc.groups.join.useMutation({
    onSuccess: () => utils.groups.getBySlug.invalidate({ slug }),
  });

  if (isLoading) {
    return <ScreenSkeleton backHref="/" />;
  }

  if (error || !group) {
    return (
      <Screen topBar={<TopBar backHref="/" title="Group" />}>
        <EmptyState icon="info" title="Group not found" description="Check the link, or ask the organizer to send it again." />
      </Screen>
    );
  }

  const isOrganizer = me?.id === group.organizerId;
  const upcoming = group.events.filter((event) => new Date(event.startsAt) >= now);
  const past = group.events.filter((event) => new Date(event.startsAt) < now).reverse();

  function card(event: GroupEvent) {
    return (
      <EventCard
        key={event.id}
        href={`/e/${event.slug}`}
        when={formatDateTime(new Date(event.startsAt))}
        title={event.title}
        status={eventChip(event, now)}
        headcount={headcountText(event.goingCount, event.maxPlayers)}
        price={eventPriceText(event)}
      />
    );
  }

  return (
    <Screen
      topBar={<TopBar backHref="/" title="Group" actions={<IconButton icon="share" label="Share group" onClick={() => setShareOpen(true)} />} />}
    >
      <div className="flex flex-col gap-2">
        <h2 className="text-display text-text-primary">{group.name}</h2>
        {group.description && <p className="text-body text-text-secondary">{group.description}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip>{group.memberCount} {group.memberCount === 1 ? "member" : "members"}</StatusChip>
          {isOrganizer && <StatusChip tone="accent">You organize this group</StatusChip>}
          {group.isMember && !isOrganizer && <StatusChip tone="success">You’re a member</StatusChip>}
        </div>
      </div>

      {isOrganizer ? (
        <div className="flex flex-wrap gap-3">
          <Button href={`/g/${slug}/events/new`} leadingIcon="plus">
            New game
          </Button>
          <Button href={`/g/${slug}/edit`} variant="secondary">
            Edit group
          </Button>
          <Button variant="secondary" onClick={() => setShareOpen(true)}>
            Share link
          </Button>
        </div>
      ) : (
        !group.isMember && (
          <div className="flex flex-col gap-2">
            <Button size="lg" fullWidth loading={join.isPending} onClick={() => requireAuth(() => join.mutate({ slug }))}>
              Join group
            </Button>
            {join.error && <p role="alert" className="text-small text-danger-fg">{join.error.message}</p>}
          </div>
        )
      )}

      <section className="flex flex-col gap-3">
        <SectionHeader title="Upcoming games" />
        {upcoming.length === 0 ? (
          <EmptyState
            icon="calendar"
            title={past.length > 0 ? "No upcoming games" : "No games yet"}
            description={
              isOrganizer
                ? past.length > 0
                  ? "Post the next one — it starts from your last game, so it only takes a date."
                  : "Create the first game, then share the link in your group chat."
                : "The organizer will post the next game here."
            }
            action={
              isOrganizer ? (
                <Button href={`/g/${slug}/events/new`} leadingIcon="plus">
                  {past.length > 0 ? "New game" : "Create the first game"}
                </Button>
              ) : undefined
            }
          />
        ) : (
          upcoming.map(card)
        )}
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={`Past games · ${past.length}`}
            action={{ label: showPast ? "Hide" : "Show", onClick: () => setShowPast((current) => !current) }}
          />
          {showPast && past.slice(0, 10).map(card)}
        </section>
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share this group"
        url={`${origin}/g/${slug}`}
        message={`Join ${group.name} to see and RSVP for games.`}
        preview={<SharePreview title={group.name} details="Join to see and RSVP for games." />}
      />
      <SignInSheet {...signInSheetProps} />
    </Screen>
  );
}
