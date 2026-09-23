"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button, EmptyState, Screen, ScreenSkeleton, StickyActionBar, TopBar } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { EventForm } from "@/app/_components/EventForm";
import {
  NO_EDITS,
  applyEdits,
  eventFormToInput,
  eventFormValuesFromEvent,
  recordEdit,
  type EventFormEdits,
} from "@/app/_components/eventFormValues";

const FORM_ID = "event-form";

/** UI spec §10.4: edit event. Only reachable while the event is Open. */
export default function EditEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: event, isLoading } = trpc.events.getBySlug.useQuery({ slug });
  const [edits, setEdits] = useState<EventFormEdits>(NO_EDITS);

  const editEvent = trpc.events.edit.useMutation({
    onSuccess: (updated) => router.push(`/e/${updated.slug}`),
  });

  if (isLoading) {
    return <ScreenSkeleton backHref={`/e/${slug}`} />;
  }

  const topBar = <TopBar backHref={`/e/${slug}`} title="Edit game" />;

  if (!event) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="info" title="Game not found" />
      </Screen>
    );
  }

  if (!event.isOrganizer) {
    return (
      <Screen topBar={topBar}>
        <EmptyState icon="lock" title="Only the organizer can edit this game" />
      </Screen>
    );
  }

  if (event.status !== "OPEN") {
    return (
      <Screen topBar={topBar}>
        <EmptyState
          icon="lock"
          title="Nothing left to edit"
          description={`This game is ${event.status.toLowerCase()}, so its details are locked.`}
        />
      </Screen>
    );
  }

  // The event as saved, with whatever's been changed on top.
  const values = applyEdits(eventFormValuesFromEvent(event), edits);

  return (
    <Screen
      topBar={topBar}
      actionBar={
        <StickyActionBar context="The price can only go down once someone has joined">
          <Button type="submit" form={FORM_ID} size="lg" fullWidth loading={editEvent.isPending}>
            Save changes
          </Button>
        </StickyActionBar>
      }
    >
      <EventForm
        formId={FORM_ID}
        values={values}
        onChange={(next, changed) => setEdits((current) => recordEdit(current, next, changed))}
        onSubmit={() => editEvent.mutate({ eventId: event.id, ...eventFormToInput(values) })}
        error={editEvent.error?.message}
      />
    </Screen>
  );
}
