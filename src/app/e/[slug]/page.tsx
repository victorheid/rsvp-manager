"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { SignInFlow } from "@/app/_components/SignInFlow";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  CONFIRMED: "Game on",
  CANCELLED: "Cancelled",
  EXPIRED: "Didn't go ahead",
};

export default function EventPage() {
  const { slug } = useParams<{ slug: string }>();
  const utils = trpc.useUtils();
  const { data: event, isLoading, error } = trpc.events.getBySlug.useQuery({ slug });
  const { requireAuth, isSigningIn, handleSignedIn, cancelSignIn } = useRequireAuth();

  const createRsvp = trpc.rsvps.create.useMutation({
    onSuccess: () => utils.events.getBySlug.invalidate({ slug }),
  });
  const dropRsvp = trpc.rsvps.drop.useMutation({
    onSuccess: () => utils.events.getBySlug.invalidate({ slug }),
  });
  const confirmEvent = trpc.events.confirm.useMutation({
    onSuccess: () => utils.events.getBySlug.invalidate({ slug }),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (error || !event) {
    return <main className="mx-auto max-w-2xl p-4">Event not found.</main>;
  }

  const goingCount = event.rsvps.length;
  const spotsLeft = event.maxPlayers !== null ? event.maxPlayers - goingCount : null;
  const isFull = event.maxPlayers !== null && goingCount >= event.maxPlayers;
  const isGoing = event.viewerRsvp?.status === "GOING";
  const canJoin = event.status === "OPEN" || event.status === "CONFIRMED";

  function priceLine() {
    if (!event) return null;
    const { priceDisplay } = event;
    if (priceDisplay.mode === "fixed") return `${formatCents(priceDisplay.amountCents)} each`;
    if (priceDisplay.mode === "locked") return `${formatCents(priceDisplay.amountCents)} each (locked)`;
    return priceDisplay.minCents !== null
      ? `${formatCents(priceDisplay.minCents)}–${formatCents(priceDisplay.maxCents)} each`
      : `Up to ${formatCents(priceDisplay.maxCents)} each`;
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 pb-24">
      <div>
        <a href={`/g/${event.group.slug}`} className="text-sm text-neutral-500 underline">
          {event.group.name}
        </a>
        <h1 className="text-2xl font-semibold">{event.title}</h1>
        <span className="mt-1 inline-block rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium dark:bg-neutral-800">
          {STATUS_LABEL[event.status] ?? event.status}
        </span>
      </div>

      {event.isOrganizer && event.status === "OPEN" && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
          <button
            type="button"
            disabled={confirmEvent.isPending}
            onClick={() => confirmEvent.mutate({ eventId: event.id })}
            className="self-start rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            Confirm now
          </button>
          {confirmEvent.error && <p className="text-sm text-red-600">{confirmEvent.error.message}</p>}
        </div>
      )}

      {isGoing && (
        <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
          You&apos;re in
          {event.viewerRsvp?.paymentMethod === "CASH" && ` · paying ${priceLine()} cash on the day`}
        </div>
      )}

      <div className="flex flex-col gap-1 text-sm text-neutral-700 dark:text-neutral-300">
        <p>{formatDateTime(new Date(event.startsAt))} – {new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit" }).format(new Date(event.endsAt))}</p>
        <p>{event.location}</p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium">
          {goingCount} in{event.maxPlayers !== null ? ` · needs ${event.minPlayers} · ${event.maxPlayers} max` : ` · needs ${event.minPlayers} · no limit`}
        </p>
        {spotsLeft !== null && spotsLeft >= 0 && <p className="text-sm text-neutral-500">{spotsLeft} spots left</p>}
      </div>

      <div>
        <p className="text-lg font-medium">{priceLine()}</p>
        {event.costBreakdown.length > 0 && (
          <ul className="mt-1 text-sm text-neutral-500">
            {event.costBreakdown.map((item) => (
              <li key={item.label}>
                {item.label} — {formatCents(item.amountCents)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">Who&apos;s in</h2>
        <ul className="flex flex-col gap-1">
          {event.rsvps.map((rsvp) => (
            <li key={rsvp.id} className="text-sm">
              {rsvp.user.firstName} {rsvp.user.lastInitial}.
            </li>
          ))}
          {event.rsvps.length === 0 && <li className="text-sm text-neutral-500">No one yet — be the first.</li>}
        </ul>
      </div>

      {isSigningIn && (
        <div className="flex flex-col gap-2">
          <SignInFlow onSuccess={handleSignedIn} />
          <button type="button" className="self-start text-sm text-neutral-500 underline" onClick={cancelSignIn}>
            Cancel
          </button>
        </div>
      )}

      {createRsvp.error && <p className="text-sm text-red-600">{createRsvp.error.message}</p>}
      {dropRsvp.error && <p className="text-sm text-red-600">{dropRsvp.error.message}</p>}

      <div className="sticky bottom-0 -mx-4 border-t border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
        {!isGoing && canJoin && !isFull && event.cashAllowed && (
          <button
            type="button"
            disabled={createRsvp.isPending}
            onClick={() => requireAuth(() => createRsvp.mutate({ eventId: event.id, paymentMethod: "CASH" }))}
            className="w-full rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            I&apos;m in — nothing charged now
          </button>
        )}
        {!isGoing && canJoin && !event.cashAllowed && (
          <p className="text-center text-sm text-neutral-500">
            Online payments aren&apos;t set up for this event yet.
          </p>
        )}
        {!isGoing && canJoin && isFull && (
          <p className="text-center text-sm text-neutral-500">This event is full.</p>
        )}
        {isGoing && canJoin && (
          <button
            type="button"
            disabled={dropRsvp.isPending}
            onClick={() => dropRsvp.mutate({ eventId: event.id })}
            className="w-full rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium disabled:opacity-50 dark:border-neutral-700"
          >
            Can&apos;t make it
          </button>
        )}
        {!canJoin && <p className="text-center text-sm text-neutral-500">{STATUS_LABEL[event.status]}</p>}
      </div>
    </main>
  );
}
