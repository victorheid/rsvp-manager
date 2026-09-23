"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { SignInFlow } from "@/app/_components/SignInFlow";
import { useRequireAuth } from "@/app/_components/useRequireAuth";
import { EMPTY_EVENT_FORM_VALUES, EventForm, type EventFormValues } from "@/app/_components/EventForm";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in the input's own local time. */
function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** UI spec §10.3: create event (trimmed — no cost breakdown editor yet). */
export default function CreateEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const fromSlug = useSearchParams().get("from");
  const { data: group, isLoading } = trpc.groups.getBySlug.useQuery({ slug });
  const { data: sourceEvent } = trpc.events.getBySlug.useQuery(
    { slug: fromSlug ?? "" },
    { enabled: !!fromSlug },
  );
  const { me, requireAuth, isSigningIn, handleSignedIn, cancelSignIn } = useRequireAuth();

  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM_VALUES);

  // §10.3 "Repeat this game": pre-fill from ?from={slug}, dates moved +7
  // days. Only runs once the source event arrives, never again after.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!sourceEvent || prefilled.current) return;
    prefilled.current = true;

    setValues({
      title: sourceEvent.title,
      description: sourceEvent.description ?? "",
      startsAt: toDatetimeLocalValue(new Date(new Date(sourceEvent.startsAt).getTime() + WEEK_MS)),
      endsAt: toDatetimeLocalValue(new Date(new Date(sourceEvent.endsAt).getTime() + WEEK_MS)),
      location: sourceEvent.location,
      cutoffAt: toDatetimeLocalValue(new Date(new Date(sourceEvent.cutoffAt).getTime() + WEEK_MS)),
      minPlayers: sourceEvent.minPlayers,
      noMax: sourceEvent.maxPlayers === null,
      maxPlayers: sourceEvent.maxPlayers ?? 10,
      pricingMode: sourceEvent.pricingMode,
      totalCostEuros: (sourceEvent.totalCostCents / 100).toString(),
      cashAllowed: sourceEvent.cashAllowed,
      autoChargeAtCutoff: sourceEvent.autoChargeAtCutoff,
    });
  }, [sourceEvent]);

  const createEvent = trpc.events.create.useMutation({
    onSuccess: (event) => router.push(`/e/${event.slug}`),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (!group) {
    return <main className="mx-auto max-w-2xl p-4">Group not found.</main>;
  }

  if (me && group.organizerId !== me.id) {
    return <main className="mx-auto max-w-2xl p-4">Only {group.name}&apos;s organizer can create events here.</main>;
  }

  function submit() {
    requireAuth(() => {
      if (!group) return;
      createEvent.mutate({
        groupId: group.id,
        title: values.title,
        description: values.description || undefined,
        startsAt: new Date(values.startsAt),
        endsAt: new Date(values.endsAt),
        location: values.location,
        cutoffAt: new Date(values.cutoffAt),
        minPlayers: values.minPlayers,
        maxPlayers: values.noMax ? undefined : values.maxPlayers,
        totalCostCents: Math.round(Number(values.totalCostEuros) * 100),
        pricingMode: values.pricingMode,
        cashAllowed: values.cashAllowed,
        autoChargeAtCutoff: values.autoChargeAtCutoff,
      });
    });
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-24">
      <h1 className="text-2xl font-semibold">New game for {group.name}</h1>
      {sourceEvent && (
        <p className="text-sm text-neutral-500">
          Copied from {sourceEvent.title}. Check the date and price.
        </p>
      )}

      <EventForm
        values={values}
        onChange={setValues}
        onSubmit={submit}
        submitLabel="Publish"
        submitting={createEvent.isPending}
        error={createEvent.error?.message}
      />

      {isSigningIn && (
        // Deliberately outside the form above — SignInFlow renders its own
        // <form>, and nested forms are invalid HTML.
        <div className="flex flex-col gap-2">
          <SignInFlow onSuccess={handleSignedIn} />
          <button type="button" className="self-start text-sm text-neutral-500 underline" onClick={cancelSignIn}>
            Cancel
          </button>
        </div>
      )}
    </main>
  );
}
