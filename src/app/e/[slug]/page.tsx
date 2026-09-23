"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  Button,
  ConfirmSheet,
  EmptyState,
  HeadcountBar,
  IconButton,
  KeyFact,
  PersonRow,
  PriceBlock,
  Screen,
  ScreenSkeleton,
  SectionHeader,
  SharePreview,
  ShareSheet,
  StatusChip,
  StickyActionBar,
  TopBar,
  useToast,
} from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { formatCents, formatDateTime, formatPlayerName, formatRelativeDay, formatTimeRange } from "@/lib/format";
import { eventChip } from "@/app/_components/eventPhase";
import { headcountText } from "@/app/_components/eventPrice";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useNow } from "@/app/_components/useNow";
import { useOpenShareOnArrival } from "@/app/_components/useOpenShareOnArrival";
import { useOrigin } from "@/app/_components/useOrigin";
import { useRequireAuth } from "@/app/_components/useRequireAuth";
import { eventPhase } from "@/server/domains/events/rules";
import { countsTowardMax, hasCapacity } from "@/server/domains/events/rules";
import { IsItOnBanner, ViewerStatusBanner, expectedPriceCents } from "./_components/EventStatusBanners";
import { RsvpSheet } from "./_components/RsvpSheet";
import { WaitlistSheet } from "./_components/WaitlistSheet";

const NAMES_SHOWN = 6;

/**
 * UI spec §4: the event page — where almost everyone lands, usually from a
 * link in a group chat with no account. It answers, in this order:
 * what/when/where → is it on → how much → who's in → what do I do.
 */
export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const utils = trpc.useUtils();
  const toast = useToast();
  const now = useNow();
  const origin = useOrigin();
  // Headcount and spots change fast before a game (UI spec §4.3): refetch on focus and every 30s.
  const { data: event, isLoading, error } = trpc.events.getBySlug.useQuery({ slug }, { refetchInterval: 30_000 });
  const { requireAuth, signInSheetProps } = useRequireAuth();
  const { shareOpen, setShareOpen } = useOpenShareOnArrival();

  const [rsvpOpen, setRsvpOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [showAllNames, setShowAllNames] = useState(false);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const refresh = () => utils.events.getBySlug.invalidate({ slug });
  const failed = (message: string) => toast({ message, tone: "error" });

  const createRsvp = trpc.rsvps.create.useMutation({
    onSuccess: () => {
      setRsvpOpen(false);
      toast({ message: "You’re in" });
      return refresh();
    },
  });
  const dropRsvp = trpc.rsvps.drop.useMutation({
    onSuccess: () => {
      setDropOpen(false);
      toast({ message: "You’ve dropped out" });
      return refresh();
    },
  });
  const leaveWaitlist = trpc.waitlist.leave.useMutation({
    onSuccess: () => {
      toast({ message: "You’ve left the waitlist" });
      return refresh();
    },
    onError: (err) => failed(err.message),
  });

  if (isLoading) {
    return <ScreenSkeleton backHref="/" />;
  }

  if (error || !event) {
    return (
      <Screen topBar={<TopBar backHref="/" title="Game" />}>
        <EmptyState icon="info" title="Game not found" description="Check the link, or ask the organizer to send it again." />
      </Screen>
    );
  }

  const phase = eventPhase(event, now);
  const players = event.rsvps.filter(countsTowardMax);
  const isGoing = event.viewerRsvp?.status === "GOING";
  const isWaitlisted = event.viewerWaitlistPosition !== null;
  const isFull = !hasCapacity(event, players.length);
  const isJoinable = phase === "OPEN" || phase === "CONFIRMED";
  const viewerWaitlistMode = event.viewerWaitlistMode;
  const price = formatCents(expectedPriceCents(event));
  const startsAt = new Date(event.startsAt);
  const spotsLeft = event.maxPlayers === null ? null : Math.max(0, event.maxPlayers - players.length);
  const shareUrl = `${origin}/e/${slug}`;
  const chip = eventChip(event, now);

  // ---- The sticky bar: one primary action for this viewer in this state (UI spec §4.2).
  let actionBar = null;
  if (isJoinable && !isGoing && !isWaitlisted && !isFull && (event.cashAllowed || event.onlineAllowed)) {
    actionBar = (
      <StickyActionBar
        context={
          phase === "OPEN"
            ? "Nothing charged now · drop out free until it’s confirmed"
            : event.onlineAllowed
              ? `Pay ${price} when you join`
              : `Pay ${price} in cash on the day`
        }
      >
        <Button size="lg" fullWidth onClick={() => requireAuth(() => setRsvpOpen(true))}>
          I’m in
        </Button>
      </StickyActionBar>
    );
  } else if (isJoinable && !isGoing && !isWaitlisted && isFull) {
    actionBar = (
      <StickyActionBar context="Nothing charged now · you can claim a spot if one opens">
        <Button size="lg" fullWidth onClick={() => requireAuth(() => setWaitlistOpen(true))}>
          Join waitlist
        </Button>
      </StickyActionBar>
    );
  } else if (isJoinable && isWaitlisted) {
    actionBar = (
      <StickyActionBar context={viewerWaitlistMode === "AUTO" ? "We’ll move you in and pay automatically if a spot opens" : "We’ll tell you if a spot opens"}>
        <div className="flex gap-3">
          <Button size="lg" variant="secondary" className="flex-1" onClick={() => setWaitlistOpen(true)}>
            Change
          </Button>
          <Button size="lg" variant="secondary" className="flex-1" loading={leaveWaitlist.isPending} onClick={() => leaveWaitlist.mutate({ eventId: event.id })}>
            Leave waitlist
          </Button>
        </div>
      </StickyActionBar>
    );
  } else if (isJoinable && isGoing) {
    actionBar = (
      <StickyActionBar context={phase === "OPEN" ? "Free to drop out until the game is confirmed" : "No automatic refund if you drop out"}>
        <Button size="lg" fullWidth variant="secondary" onClick={() => setDropOpen(true)}>
          Can’t make it
        </Button>
      </StickyActionBar>
    );
  }

  const visiblePlayers = showAllNames ? players : players.slice(0, NAMES_SHOWN);
  const priceNote =
    event.priceDisplay.mode === "range"
      ? `Court costs ${formatCents(event.totalCostCents)}, split between everyone who plays. The more who join, the less each pays. Final price is set when the game confirms.`
      : event.priceDisplay.mode === "locked"
        ? "Locked when the game confirmed."
        : undefined;

  return (
    <Screen
      topBar={
        <TopBar
          backHref={`/g/${event.group.slug}`}
          title={event.group.name}
          actions={<IconButton icon="share" label="Share this game" onClick={() => setShareOpen(true)} />}
        />
      }
      actionBar={actionBar}
    >
      <div className="flex flex-col gap-2">
        <Link href={`/g/${event.group.slug}`} className="text-small-strong text-text-link">
          {event.group.name}
        </Link>
        <h2 className="text-display text-text-primary">{event.title}</h2>
        <div className="flex flex-wrap gap-2">
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
        </div>
      </div>

      {event.isOrganizer && (
        <Button href={`/e/${slug}/manage`} variant="secondary" fullWidth>
          Manage this game
        </Button>
      )}

      <ViewerStatusBanner event={event} now={now} />

      <div className="flex flex-col gap-3">
        <KeyFact
          icon="calendar"
          primary={formatTimeRange(startsAt, new Date(event.endsAt))}
          secondary={formatRelativeDay(startsAt, now)}
        />
        <KeyFact
          icon="pin"
          primary={event.location}
          secondary="Open in Maps"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
        />
      </div>

      <IsItOnBanner event={event} now={now} />

      <HeadcountBar
        count={event.rsvps.length}
        min={event.minPlayers}
        max={event.maxPlayers}
        note={spotsLeft === null ? undefined : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`}
      />

      <PriceBlock
        amount={
          event.priceDisplay.mode === "range"
            ? event.priceDisplay.minCents !== null
              ? `${formatCents(event.priceDisplay.minCents)}–${formatCents(event.priceDisplay.maxCents)} each`
              : `Up to ${formatCents(event.priceDisplay.maxCents)} each`
            : `${formatCents(event.priceDisplay.amountCents)} each`
        }
        note={
          <>
            {priceNote}
            {event.costBreakdown.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5">
                {event.costBreakdown.map((item) => (
                  <li key={item.label}>
                    {item.label} — {formatCents(item.amountCents)}
                  </li>
                ))}
              </ul>
            )}
          </>
        }
        fee={
          event.onlineAllowed
            ? `Card adds a ${formatCents(event.cardFeeCents)} service fee${event.cashAllowed ? " · wallet and cash have none" : " · wallet has none"}`
            : "Pay the organizer in cash on the day · no fee"
        }
      />

      <section className="flex flex-col gap-1">
        <SectionHeader
          title={`Who’s in · ${players.length}`}
          action={
            players.length > NAMES_SHOWN
              ? { label: showAllNames ? "Show fewer" : `Show all ${players.length}`, onClick: () => setShowAllNames((current) => !current) }
              : undefined
          }
        />
        {/* §4: walk-ins aren't shown publicly — they're organizer records (manage screen). */}
        {visiblePlayers.map((rsvp) =>
          rsvp.user ? (
            <PersonRow
              key={rsvp.id}
              name={formatPlayerName(rsvp.user)}
              trailing={rsvp.userId === event.group.organizerId ? <StatusChip tone="accent">Organizer</StatusChip> : undefined}
            />
          ) : null,
        )}
        {players.length === 0 && <p className="text-small text-text-secondary">No one yet — be the first.</p>}
      </section>

      {event.waitlistEntries.length > 0 && (
        <section className="flex flex-col gap-1">
          <SectionHeader
            title={`Waitlist · ${event.waitlistEntries.length}`}
            action={{ label: showWaitlist ? "Hide" : "Show", onClick: () => setShowWaitlist((current) => !current) }}
          />
          {showWaitlist &&
            event.waitlistEntries.map((entry, index) => (
              <PersonRow key={entry.id} name={formatPlayerName(entry.user)} trailing={`#${index + 1}`} />
            ))}
        </section>
      )}

      {event.description && (
        <section className="flex flex-col gap-1">
          <SectionHeader title="About this game" />
          <p className="whitespace-pre-line text-body text-text-secondary">{event.description}</p>
        </section>
      )}

      <RsvpSheet
        open={rsvpOpen}
        eventId={event.id}
        onClose={() => setRsvpOpen(false)}
        cashAllowed={event.cashAllowed}
        onlineAllowed={event.onlineAllowed}
        confirmed={phase === "CONFIRMED"}
        priceCents={expectedPriceCents(event)}
        cardFeeCents={event.cardFeeCents}
        pending={createRsvp.isPending}
        error={createRsvp.error?.message}
        onJoin={(join) => createRsvp.mutate({ eventId: event.id, ...join })}
      />

      <WaitlistSheet
        open={waitlistOpen}
        onClose={() => setWaitlistOpen(false)}
        eventId={event.id}
        onlineAllowed={event.onlineAllowed}
        priceCents={expectedPriceCents(event)}
        currentMode={isWaitlisted ? (viewerWaitlistMode ?? "MANUAL") : undefined}
        onDone={(message) => {
          setWaitlistOpen(false);
          toast({ message });
          return refresh();
        }}
      />

      <ConfirmSheet
        open={dropOpen}
        onClose={() => setDropOpen(false)}
        title={`Drop out of ${event.title}?`}
        tone={phase === "CONFIRMED" ? "destructive" : "default"}
        banner={
          phase === "CONFIRMED"
            ? {
                tone: "warning",
                title: "This game is confirmed",
                body: `The organizer may still ask you to pay ${price}. Your spot goes to the waitlist.`,
              }
            : { tone: "info", title: "Nothing has been charged", body: "Your spot goes to the next person on the waitlist." }
        }
        confirmLabel={phase === "CONFIRMED" ? "Drop out anyway" : "Drop out"}
        cancelLabel="Stay in"
        pending={dropRsvp.isPending}
        error={dropRsvp.error?.message}
        onConfirm={() => dropRsvp.mutate({ eventId: event.id })}
      />

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share this game"
        url={shareUrl}
        message={`${event.title} · ${formatDateTime(startsAt)} · ${event.location}`}
        preview={
          <SharePreview
            title={event.title}
            details={`${formatDateTime(startsAt)} · ${event.location}`}
            summary={`${headcountText(event.rsvps.length, event.maxPlayers)}${
              spotsLeft !== null ? ` · ${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left` : ""
            } · ${price} each`}
          />
        }
      />
      <SignInSheet {...signInSheetProps} />
    </Screen>
  );
}
