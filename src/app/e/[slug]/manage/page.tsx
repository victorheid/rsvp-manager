"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ActionMenu,
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  FilterChip,
  HeadcountBar,
  ICON_BUTTON_CLASS,
  Icon,
  PersonManageRow,
  PersonRow,
  Screen,
  ScreenSkeleton,
  SectionHeader,
  SharePreview,
  ShareSheet,
  StatusChip,
  TopBar,
  type ActionMenuItem,
  useToast,
} from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { formatCents, formatDateTime, formatPlayerName } from "@/lib/format";
import { phaseChip } from "@/app/_components/eventPhase";
import { headcountText } from "@/app/_components/eventPrice";
import { useNow } from "@/app/_components/useNow";
import { useOrigin } from "@/app/_components/useOrigin";
import type { OrganizerEventAction } from "@/server/domains/events";
import { countsTowardMax } from "@/server/domains/events/rules";
import { hasShownUp } from "@/server/domains/rsvps/rules";
import { AddWalkInSheet } from "./_components/AddWalkInSheet";
import {
  attentionRank,
  matchesFilter,
  personDetail,
  personName,
  type ManageFilter,
  type OrganizerRsvp,
} from "./_components/managePresentation";

/**
 * UI spec §10.5: manage one game, one screen per phase. What it shows and
 * offers depends on where the game is — open, confirmed, live, finished —
 * and that comes from the server (`eventActions`, and each person's
 * `actions`), so this page only renders it. Rows are informational; every
 * change happens in the ••• menu.
 */
export default function ManageEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const utils = trpc.useUtils();
  const toast = useToast();
  const now = useNow();
  const origin = useOrigin();
  const { data: event, isLoading: eventLoading } = trpc.events.getBySlug.useQuery({ slug });
  const { data: view } = trpc.rsvps.forOrganizer.useQuery({ eventId: event?.id ?? "" }, { enabled: !!event?.id });

  const [filter, setFilter] = useState<ManageFilter>("ALL");
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [removing, setRemoving] = useState<OrganizerRsvp | null>(null);
  const [refunding, setRefunding] = useState<OrganizerRsvp | null>(null);
  const [refundAllOpen, setRefundAllOpen] = useState(false);
  const [showDropped, setShowDropped] = useState<boolean | null>(null);
  const [showWaitlist, setShowWaitlist] = useState(false);

  const refresh = () => Promise.all([utils.rsvps.forOrganizer.invalidate(), utils.events.getBySlug.invalidate({ slug })]);
  const failed = (message: string) => toast({ message, tone: "error" });

  const confirmEvent = trpc.events.confirm.useMutation({
    onSuccess: () => {
      setConfirmOpen(false);
      toast({ message: "Game confirmed" });
      return refresh();
    },
  });
  const cancelEvent = trpc.events.cancel.useMutation({
    onSuccess: () => {
      setCancelOpen(false);
      toast({ message: "Game cancelled" });
      return refresh();
    },
  });
  const markAttendance = trpc.rsvps.markAttendance.useMutation({ onSuccess: refresh, onError: (err) => failed(err.message) });
  const markPaid = trpc.rsvps.markPaidOutsideApp.useMutation({ onSuccess: refresh, onError: (err) => failed(err.message) });
  const undoPaid = trpc.rsvps.undoMarkPaidOutsideApp.useMutation({ onSuccess: refresh, onError: (err) => failed(err.message) });
  const removeRsvp = trpc.rsvps.remove.useMutation({
    onSuccess: () => {
      setRemoving(null);
      return refresh();
    },
  });
  const refundRsvp = trpc.rsvps.refund.useMutation({
    onSuccess: (result) => {
      setRefunding(null);
      toast({ message: `${formatCents(result.refundedCents)} refunded` });
      return refresh();
    },
  });
  const refundAll = trpc.rsvps.refundAll.useMutation({
    onSuccess: (result) => {
      setRefundAllOpen(false);
      toast({
        message: result.failed > 0 ? `${result.refunded} refunded, ${result.failed} failed — try again` : `${result.refunded} refunded`,
        tone: result.failed > 0 ? "error" : undefined,
      });
      return refresh();
    },
  });
  const addWalkIn = trpc.rsvps.addWalkIn.useMutation({
    onSuccess: (_walkIn, variables) => {
      setWalkInOpen(false);
      toast({ message: `${variables.name} added` });
      return refresh();
    },
  });

  if (eventLoading) {
    return <ScreenSkeleton backHref={`/e/${slug}`} />;
  }

  const topBar = <TopBar backHref={`/e/${slug}`} title="Manage" />;

  if (!event) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="info" title="Game not found" description="Check the link, or open the game from its group." />
      </Screen>
    );
  }

  if (!event.isOrganizer) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="lock" title="Only the organizer can manage this game" />
      </Screen>
    );
  }

  if (!view) {
    return <ScreenSkeleton backHref={`/e/${slug}`} />;
  }

  const { eventActions } = view;
  const phase = eventActions.phase;
  const gameStarted = phase === "LIVE" || phase === "FINISHED";
  const amountCents = event.priceDisplay.mode === "range" ? event.priceDisplay.maxCents : event.priceDisplay.amountCents;
  const organizerId = event.group.organizerId;
  const startsAt = new Date(event.startsAt);
  const chip = phaseChip(phase);

  const going = view.rsvps.filter((rsvp) => rsvp.status === "GOING");
  const dropped = view.rsvps.filter((rsvp) => rsvp.status === "CANCELLED");
  const players = going.filter(countsTowardMax);
  const noShows = going.filter((rsvp) => !hasShownUp(rsvp));
  // The server counts walk-ins toward the minimum and the price split, but not toward the max.
  const spotsLeft = event.maxPlayers === null ? null : Math.max(0, event.maxPlayers - players.length);
  const spotsNote = spotsLeft === null ? undefined : `${spotsLeft} ${spotsLeft === 1 ? "spot" : "spots"} left`;
  const dropdownDroppedOpen = showDropped ?? dropped.some((rsvp) => rsvp.paymentStatus !== "PENDING");

  // ---- Filters: only the ones that have someone in them, and none at all before there's anything to chase.
  const counts: Record<ManageFilter, number> = {
    ALL: going.length,
    OWES: going.filter((rsvp) => matchesFilter(rsvp, "OWES")).length,
    CASH: going.filter((rsvp) => matchesFilter(rsvp, "CASH")).length,
    NO_SHOWS: noShows.length,
  };
  const filterLabels: Array<[ManageFilter, string]> = [
    ["ALL", `All · ${counts.ALL}`],
    ["OWES", `Owes · ${counts.OWES}`],
    ["CASH", `${gameStarted ? "Cash to collect" : "Cash"} · ${counts.CASH}`],
    ["NO_SHOWS", `No-shows · ${counts.NO_SHOWS}`],
  ];
  const visibleFilters = phase === "OPEN" ? [] : filterLabels.filter(([key]) => key === "ALL" || counts[key] > 0);
  const activeFilter = visibleFilters.some(([key]) => key === filter) ? filter : "ALL";
  const shownGoing = going
    .filter((rsvp) => matchesFilter(rsvp, activeFilter))
    .map((rsvp, index) => ({ rsvp, index }))
    .sort((a, b) => attentionRank(a.rsvp, phase) - attentionRank(b.rsvp, phase) || a.index - b.index)
    .map(({ rsvp }) => rsvp);

  // ---- Actions on one person (the ••• menu). Most likely first; Message before Remove.
  function menuFor(rsvp: OrganizerRsvp): ActionMenuItem[] {
    const name = personName(rsvp);
    const amount = formatCents(amountCents);
    const itemFor = (action: OrganizerRsvp["actions"][number]): ActionMenuItem => {
      switch (action) {
        case "MARK_PAID": {
          const restoreTo = rsvp.paymentStatus === "OWES" ? "OWES" : "PENDING";
          return {
            label: gameStarted && rsvp.paymentMethod === "CASH" ? "Mark as paid (cash received)" : "Mark as paid outside app",
            description: `Records ${amount} received in cash or by transfer. No money moves in the app.`,
            tone: "primary",
            onSelect: () =>
              markPaid.mutate(
                { rsvpId: rsvp.id },
                {
                  onSuccess: () =>
                    toast({
                      message: `${name} marked as paid outside app`,
                      actionLabel: "Undo",
                      onAction: () => undoPaid.mutate({ rsvpId: rsvp.id, restoreTo }),
                    }),
                },
              ),
          };
        }
        case "MARK_NO_SHOW":
          return {
            label: "Mark as no-show",
            description: "Counts against them in this group. You can undo it.",
            tone: "primary",
            onSelect: () =>
              markAttendance.mutate(
                { rsvpId: rsvp.id, attended: false },
                {
                  onSuccess: () =>
                    toast({
                      message: `${name} marked as no-show`,
                      actionLabel: "Undo",
                      onAction: () => markAttendance.mutate({ rsvpId: rsvp.id, attended: rsvp.attended }),
                    }),
                },
              ),
          };
        case "UNDO_NO_SHOW":
          return {
            label: "Undo no-show",
            description: "Counts them as showed again.",
            tone: "primary",
            onSelect: () =>
              markAttendance.mutate(
                { rsvpId: rsvp.id, attended: null },
                {
                  onSuccess: () =>
                    toast({
                      message: `${name} counts as showed`,
                      actionLabel: "Undo",
                      onAction: () => markAttendance.mutate({ rsvpId: rsvp.id, attended: false }),
                    }),
                },
              ),
          };
        case "REFUND":
          return {
            label: `Refund ${amount}`,
            description: "The price goes back to their wallet or card. The service fee isn’t refunded.",
            tone: "primary",
            onSelect: () => setRefunding(rsvp),
          };
        case "REMOVE":
          return {
            label: "Remove from game",
            description: "Their spot goes to the waitlist.",
            tone: "danger",
            onSelect: () => setRemoving(rsvp),
          };
      }
    };

    const items = rsvp.actions.filter((action) => action !== "REMOVE").map(itemFor);
    const digits = rsvp.userId === organizerId ? undefined : rsvp.user?.phoneNumber.replace(/\D/g, "");
    if (digits) {
      items.push({ label: "Message player", href: `https://wa.me/${digits}`, external: true });
    }
    if (rsvp.actions.includes("REMOVE")) items.push(itemFor("REMOVE"));
    return items;
  }

  function row(rsvp: OrganizerRsvp) {
    const { text, tone } = personDetail({
      rsvp,
      phase,
      isOrganizersOwnRsvp: rsvp.userId === organizerId,
      amountCents,
    });
    return <PersonManageRow key={rsvp.id} name={personName(rsvp)} detail={text} tone={tone} items={menuFor(rsvp)} />;
  }

  // ---- Event-level actions, from the rules: a primary, an optional secondary, and the ••• menu.
  function eventActionButton(action: OrganizerEventAction, variant: "primary" | "secondary") {
    const common = { variant, className: "flex-1" } as const;
    switch (action) {
      case "SHARE":
        return (
          <Button {...common} leadingIcon="share" onClick={() => setShareOpen(true)}>
            Share game
          </Button>
        );
      case "CONFIRM":
        return (
          <Button {...common} onClick={() => setConfirmOpen(true)}>
            {variant === "primary" ? "Confirm game" : "Confirm now"}
          </Button>
        );
      case "ADD_WALK_IN":
        return (
          <Button {...common} leadingIcon="plus" onClick={() => setWalkInOpen(true)}>
            Add walk-in
          </Button>
        );
      case "REPEAT":
        return (
          <Button {...common} href={`/g/${event?.group.slug}/events/new?from=${slug}`}>
            Repeat this game
          </Button>
        );
      case "EDIT":
      case "VIEW_PUBLIC_PAGE":
      case "REFUND_ALL":
      case "CANCEL":
        return null;
    }
  }

  const menuItems: ActionMenuItem[] = eventActions.menu.map((action): ActionMenuItem => {
    switch (action) {
      case "EDIT":
        return { label: "Edit game", href: `/e/${slug}/edit` };
      case "REPEAT":
        return {
          label: "Repeat this game",
          description: "A new game with the same details, one week later.",
          href: `/g/${event.group.slug}/events/new?from=${slug}`,
        };
      case "ADD_WALK_IN":
        return { label: "Add walk-in", description: "Someone turning up who isn’t using the app.", onSelect: () => setWalkInOpen(true) };
      case "VIEW_PUBLIC_PAGE":
        return { label: "View public page", href: `/e/${slug}` };
      case "REFUND_ALL":
        return {
          label: "Refund everyone who paid online",
          description: "Prices go back to their wallets and cards. Service fees aren’t refunded.",
          onSelect: () => setRefundAllOpen(true),
        };
      case "CANCEL":
        return {
          label: "Cancel game",
          description:
            phase === "CONFIRMED" && event.onlineAllowed
              ? "Everyone who paid online is refunded in full, service fee included."
              : "Players will see it’s cancelled. Nothing has been charged online.",
          tone: "danger",
          onSelect: () => setCancelOpen(true),
        };
      case "SHARE":
        return { label: "Share game", onSelect: () => setShareOpen(true) };
      case "CONFIRM":
        return { label: "Confirm game", onSelect: () => setConfirmOpen(true) };
    }
  });

  // ---- The banner that explains this phase.
  const cutoffPassed = now >= event.cutoffAt;
  const banner =
    phase === "OPEN" ? (
      cutoffPassed || !event.autoChargeAtCutoff ? (
        <Banner
          tone={cutoffPassed ? "warning" : "info"}
          title={cutoffPassed ? `${going.length} of ${event.minPlayers} are in — it’s your call` : "You confirm this game yourself"}
        >
          {cutoffPassed
            ? "Confirm anyway, or cancel. If you don’t decide, it expires 48 hours after the start."
            : "Nobody is charged until you do."}
        </Banner>
      ) : (
        <Banner tone="info" title={`Confirms automatically ${formatDateTime(new Date(event.cutoffAt))}`}>
          Only if {event.minPlayers} or more are in. Nobody is charged until then.
        </Banner>
      )
    ) : phase === "LIVE" ? (
      <Banner tone="info" title="Everyone counts as showed">
        Open ••• on a row to mark a no-show or record cash you’ve received.
      </Banner>
    ) : phase === "FINISHED" ? (
      <Banner tone="info" title="Everyone not marked a no-show counts as played">
        You can still record cash you’ve received.
      </Banner>
    ) : phase === "CANCELLED" ? (
      <Banner tone="danger" title="This game was cancelled" />
    ) : phase === "EXPIRED" ? (
      <Banner tone="info" title="This game didn’t go ahead">
        It wasn’t confirmed in time, so nobody was charged.
      </Banner>
    ) : null;

  const cameCount = going.filter(hasShownUp).length;
  const belowMinimum = going.length < event.minPlayers;

  return (
    <Screen
      topBar={
        <TopBar
          backHref={`/e/${slug}`}
          title="Manage"
          actions={
            <ActionMenu label="Game options" items={menuItems} triggerClassName={ICON_BUTTON_CLASS}>
              <Icon name="more" />
            </ActionMenu>
          }
        />
      }
    >
      <div className="flex flex-col gap-1.5">
        <div>
          <StatusChip tone={chip.tone}>{chip.label}</StatusChip>
        </div>
        <h2 className="text-title text-text-primary">{event.title}</h2>
        <p className="text-small text-text-secondary">
          {formatDateTime(startsAt)} · {event.location}
        </p>
      </div>

      {gameStarted ? (
        <HeadcountBar
          count={cameCount}
          min={event.minPlayers}
          max={event.maxPlayers}
          countLabel="came"
          note={noShows.length > 0 ? `${noShows.length} ${noShows.length === 1 ? "no-show" : "no-shows"}` : "Everyone came"}
        />
      ) : (
        <HeadcountBar count={going.length} min={event.minPlayers} max={event.maxPlayers} note={spotsNote} />
      )}

      {banner}

      <div className="flex gap-3">
        {eventActionButton(eventActions.primary, "primary")}
        {eventActions.secondary && eventActionButton(eventActions.secondary, "secondary")}
      </div>

      <section className="flex flex-col gap-3">
        {visibleFilters.length > 1 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
            {visibleFilters.map(([key, label]) => (
              <FilterChip key={key} selected={activeFilter === key} onClick={() => setFilter(key)}>
                {label}
              </FilterChip>
            ))}
          </div>
        )}
        <SectionHeader title={gameStarted ? `Who’s here · ${cameCount} came` : `Going · ${going.length}`} />
        {shownGoing.length === 0 ? (
          <p className="text-small text-text-secondary">{going.length === 0 ? "No one yet." : "No one matches this filter."}</p>
        ) : (
          <div className="rounded-lg border border-border-default bg-bg-surface">{shownGoing.map(row)}</div>
        )}
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

      {dropped.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionHeader
            title={`Dropped out · ${dropped.length}`}
            action={{ label: dropdownDroppedOpen ? "Hide" : "Show", onClick: () => setShowDropped(!dropdownDroppedOpen) }}
          />
          {dropdownDroppedOpen && <div className="rounded-lg border border-border-default bg-bg-surface">{dropped.map(row)}</div>}
        </section>
      )}

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={`Confirm ${event.title}?`}
        banner={
          belowMinimum
            ? {
                tone: "warning",
                title: `Only ${going.length} of the minimum ${event.minPlayers} are in`,
                body: "A game can’t be confirmed until the minimum is in. You can lower the minimum by editing the game.",
              }
            : {
                tone: "info",
                title: `${going.length} players are in`,
                body:
                  event.priceDisplay.mode === "range"
                    ? "The price locks now, split between everyone who’s in."
                    : `The price stays ${formatCents(amountCents)} each.`,
              }
        }
        confirmLabel="Confirm game"
        confirmDisabled={belowMinimum}
        cancelLabel="Not yet"
        pending={confirmEvent.isPending}
        error={confirmEvent.error?.message}
        onConfirm={() => confirmEvent.mutate({ eventId: event.id })}
      />

      <ConfirmSheet
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${event.title}?`}
        tone="destructive"
        banner={{
          tone: "danger",
          title: `${going.length} ${going.length === 1 ? "person is" : "people are"} in`,
          body: "The game will show as cancelled on its page. This can’t be undone.",
        }}
        confirmLabel="Cancel game"
        cancelLabel="Keep game"
        pending={cancelEvent.isPending}
        error={cancelEvent.error?.message}
        onConfirm={() => cancelEvent.mutate({ eventId: event.id })}
      />

      <ConfirmSheet
        open={refunding !== null}
        onClose={() => setRefunding(null)}
        title={refunding ? `Refund ${personName(refunding)}?` : "Refund?"}
        banner={{
          tone: "info",
          title: `${formatCents(amountCents)} goes back to their wallet or card`,
          body: "The service fee isn’t refunded. You can refund until you’re paid out, two days after the game.",
        }}
        confirmLabel={refunding ? `Refund ${personName(refunding)}` : "Refund"}
        pending={refundRsvp.isPending}
        error={refundRsvp.error?.message}
        onConfirm={() => refunding && refundRsvp.mutate({ rsvpId: refunding.id })}
      />

      <ConfirmSheet
        open={refundAllOpen}
        onClose={() => setRefundAllOpen(false)}
        title="Refund everyone who paid online?"
        tone="destructive"
        banner={{
          tone: "warning",
          title: "Prices go back to wallets and cards",
          body: "Service fees aren’t refunded, and cash isn’t affected. You can refund until you’re paid out, two days after the game.",
        }}
        confirmLabel="Refund everyone"
        pending={refundAll.isPending}
        error={refundAll.error?.message}
        onConfirm={() => refundAll.mutate({ eventId: event.id })}
      />

      <ConfirmSheet
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Remove ${personName(removing)} from the game?` : "Remove from the game?"}
        tone="destructive"
        banner={
          removing
            ? {
                tone: "warning",
                title: phase === "CONFIRMED" ? "This game is confirmed" : "Their spot is released",
                body:
                  phase === "CONFIRMED"
                    ? "Their payment stays on record; you can mark it as paid or handle it outside the app. Their spot goes to the waitlist."
                    : "Nothing has been charged. Their spot goes to the waitlist.",
              }
            : undefined
        }
        confirmLabel={removing ? `Remove ${personName(removing)}` : "Remove"}
        cancelLabel="Keep in game"
        pending={removeRsvp.isPending}
        error={removeRsvp.error?.message}
        onConfirm={() => removing && removeRsvp.mutate({ rsvpId: removing.id })}
      />

      <AddWalkInSheet
        open={walkInOpen}
        onClose={() => setWalkInOpen(false)}
        pending={addWalkIn.isPending}
        error={addWalkIn.error?.message}
        onAdd={(walkIn) => addWalkIn.mutate({ eventId: event.id, ...walkIn })}
      />

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        title="Share this game"
        url={`${origin}/e/${slug}`}
        message={`${event.title} · ${formatDateTime(startsAt)} · ${event.location}`}
        preview={
          <SharePreview
            title={event.title}
            details={`${formatDateTime(startsAt)} · ${event.location}`}
            summary={`${headcountText(going.length, event.maxPlayers)} · ${formatCents(amountCents)} each`}
          />
        }
      />
    </Screen>
  );
}
