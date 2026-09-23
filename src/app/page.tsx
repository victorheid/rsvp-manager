"use client";

import { trpc } from "@/lib/trpc/client";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-IE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** UI spec §6: signed-in "Games" home, or a short signed-out landing. */
export default function HomePage() {
  const { data: me, isLoading: meLoading } = trpc.auth.me.useQuery();
  const { data: upcoming } = trpc.rsvps.myUpcoming.useQuery(undefined, { enabled: !!me });
  const { data: groups } = trpc.groups.mine.useQuery(undefined, { enabled: !!me });

  if (meLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (!me) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
        <h1 className="text-2xl font-semibold">RSVP Manager</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Group sports RSVPs and payments — post a game, share the link, and see who&apos;s in.
        </p>
        <a
          href="/groups/new"
          className="self-start rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
        >
          Create a group
        </a>
        <p className="text-sm text-neutral-500">Got a link? Just open it.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <h1 className="text-2xl font-semibold">Your games</h1>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">Upcoming</h2>
        {upcoming?.length === 0 && (
          <p className="text-sm text-neutral-500">
            Your games will show up here. Got a link from your group? Open it to join.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {upcoming?.map((rsvp) => (
            <li key={rsvp.id}>
              <a
                href={`/e/${rsvp.event.slug}`}
                className="block rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <p className="font-medium">{rsvp.event.title}</p>
                <p className="text-sm text-neutral-500">
                  {rsvp.event.group.name} · {formatDate(new Date(rsvp.event.startsAt))}
                </p>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">Your groups</h2>
        <ul className="flex flex-col gap-2">
          {groups?.map((group) => (
            <li key={group.id}>
              <a href={`/g/${group.slug}`} className="block rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                <p className="font-medium">
                  {group.name}
                  {group.organizerId === me.id && (
                    <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-normal dark:bg-neutral-800">
                      Organizer
                    </span>
                  )}
                </p>
              </a>
            </li>
          ))}
        </ul>
        <a href="/groups/new" className="mt-2 inline-block text-sm underline">
          Create a group
        </a>
      </section>
    </main>
  );
}
