"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { EMPTY_EVENT_FORM_VALUES, EventForm, type EventFormValues } from "@/app/_components/EventForm";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** UI spec §10.4: edit event. Only reachable while the event is Open. */
export default function EditEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: event, isLoading } = trpc.events.getBySlug.useQuery({ slug });

  const [values, setValues] = useState<EventFormValues>(EMPTY_EVENT_FORM_VALUES);

  const loaded = useRef(false);
  useEffect(() => {
    if (!event || loaded.current) return;
    loaded.current = true;

    setValues({
      title: event.title,
      description: event.description ?? "",
      startsAt: toDatetimeLocalValue(new Date(event.startsAt)),
      endsAt: toDatetimeLocalValue(new Date(event.endsAt)),
      location: event.location,
      cutoffAt: toDatetimeLocalValue(new Date(event.cutoffAt)),
      minPlayers: event.minPlayers,
      noMax: event.maxPlayers === null,
      maxPlayers: event.maxPlayers ?? 10,
      pricingMode: event.pricingMode,
      totalCostEuros: (event.totalCostCents / 100).toString(),
      cashAllowed: event.cashAllowed,
      autoChargeAtCutoff: event.autoChargeAtCutoff,
    });
  }, [event]);

  const editEvent = trpc.events.edit.useMutation({
    onSuccess: (updated) => router.push(`/e/${updated.slug}`),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (!event) {
    return <main className="mx-auto max-w-2xl p-4">Event not found.</main>;
  }

  if (!event.isOrganizer) {
    return <main className="mx-auto max-w-2xl p-4">Only the organizer can edit this event.</main>;
  }

  if (event.status !== "OPEN") {
    return (
      <main className="mx-auto max-w-2xl p-4">
        This event is {event.status.toLowerCase()} — there&apos;s nothing left to edit.
      </main>
    );
  }

  function submit() {
    if (!event) return;
    editEvent.mutate({
      eventId: event.id,
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
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-24">
      <h1 className="text-2xl font-semibold">Edit: {event.title}</h1>
      <p className="text-sm text-neutral-500">
        Price can only go down once someone has RSVP&apos;d, not up.
      </p>

      <EventForm
        values={values}
        onChange={setValues}
        onSubmit={submit}
        submitLabel="Save"
        submitting={editEvent.isPending}
        error={editEvent.error?.message}
      />
    </main>
  );
}
