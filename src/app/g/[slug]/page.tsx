"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { SignInFlow } from "@/app/_components/SignInFlow";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

function formatDate(date: Date): string {
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
  CONFIRMED: "Confirmed",
  CANCELLED: "Cancelled",
  EXPIRED: "Didn't go ahead",
};

export default function GroupPage() {
  const { slug } = useParams<{ slug: string }>();
  const utils = trpc.useUtils();
  const { data: group, isLoading, error } = trpc.groups.getBySlug.useQuery({ slug });
  const { me, requireAuth, isSigningIn, handleSignedIn, cancelSignIn } = useRequireAuth();
  const [now] = useState(() => Date.now());

  const join = trpc.groups.join.useMutation({
    onSuccess: () => utils.groups.getBySlug.invalidate({ slug }),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (error || !group) {
    return <main className="mx-auto max-w-2xl p-4">Group not found.</main>;
  }

  const upcoming = group.events.filter((event) => new Date(event.startsAt).getTime() >= now);
  const past = group.events.filter((event) => new Date(event.startsAt).getTime() < now);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">{group.name}</h1>
        {group.description && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{group.description}</p>}
        <p className="mt-1 text-sm text-neutral-500">{group.memberCount} members</p>
      </div>

      {group.isMember ? (
        <p className="text-sm text-neutral-500">You&apos;re a member</p>
      ) : (
        <button
          type="button"
          disabled={join.isPending}
          onClick={() => requireAuth(() => join.mutate({ slug }))}
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          Join group
        </button>
      )}

      {isSigningIn && (
        <div className="flex flex-col gap-2">
          <SignInFlow onSuccess={handleSignedIn} />
          <button type="button" className="self-start text-sm text-neutral-500 underline" onClick={cancelSignIn}>
            Cancel
          </button>
        </div>
      )}

      {join.error && <p className="text-sm text-red-600">{join.error.message}</p>}

      {me?.id === group.organizerId && (
        <div className="flex gap-2">
          <a
            href={`/g/${slug}/events/new`}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
          >
            New game
          </a>
          <a
            href={`/g/${slug}/edit`}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
          >
            Edit group
          </a>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">Upcoming games</h2>
        {upcoming.length === 0 && <p className="text-sm text-neutral-500">No games yet.</p>}
        <ul className="flex flex-col gap-2">
          {upcoming.map((event) => (
            <li key={event.id}>
              <a
                href={`/e/${event.slug}`}
                className="block rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <p className="font-medium">{event.title}</p>
                <p className="text-sm text-neutral-500">
                  {formatDate(new Date(event.startsAt))} · {STATUS_LABEL[event.status] ?? event.status} ·{" "}
                  {event.goingCount}
                  {event.maxPlayers !== null ? `/${event.maxPlayers}` : ""} in
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {past.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-sm font-medium text-neutral-500">Past games ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {past.map((event) => (
              <li key={event.id}>
                <a href={`/e/${event.slug}`} className="block rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
                  {event.title} · {formatDate(new Date(event.startsAt))}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
