"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData } from "@tanstack/react-query";
import { Button, EmptyState, Screen, ScreenSkeleton, StickyActionBar, TopBar } from "@/components/ui";
import { trpc } from "@/lib/trpc/client";
import { EventForm } from "@/app/_components/EventForm";
import {
  EMPTY_EVENT_FORM_VALUES,
  NO_EDITS,
  applyEdits,
  eventFormToInput,
  eventFormValuesFromEvent,
  eventFormValuesFromSuggestion,
  nextWeeklyStart,
  recordEdit,
  startsAtFromValues,
  toDateInput,
  toTimeInput,
  type EventFormEdits,
  type EventFormValues,
} from "@/app/_components/eventFormValues";
import { SignInSheet } from "@/app/_components/SignInSheet";
import { useRequireAuth } from "@/app/_components/useRequireAuth";
import { useRequireVerifiedEmail } from "@/app/_components/useRequireVerifiedEmail";
import { VerifyEmailSheet } from "@/app/_components/VerifyEmailSheet";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FORM_ID = "event-form";

/**
 * UI spec §10.3: create event. The date leads; once it's set, everything
 * else defaults from the group's last game and re-anchors to the new date
 * (`events.suggestDefaults`). The form's values are derived — defaults,
 * then the suggestion, then the organizer's own edits on top — so fields
 * they've typed are never overwritten, while changing the date again moves
 * everything they haven't touched, including the title's weekday.
 *
 * "Repeat this game" (`?from={slug}`) is the same form pre-filled from that
 * game, a week later, with no suggestion layered on top.
 */
export default function CreateEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const fromSlug = useSearchParams().get("from");
  const { data: group, isLoading } = trpc.groups.getBySlug.useQuery({ slug });
  const { data: sourceEvent } = trpc.events.getBySlug.useQuery({ slug: fromSlug ?? "" }, { enabled: !!fromSlug });
  const { me, requireAuth, signInSheetProps } = useRequireAuth();
  const { requireEmail, verifyEmailSheetProps } = useRequireVerifiedEmail();
  const [edits, setEdits] = useState<EventFormEdits>(NO_EDITS);

  const isOrganizer = group?.access === "MEMBER" && group.isOrganizer;

  // Layer 1: a group that already has games opens on the next likely date and time.
  const startDefaults: EventFormValues = useMemo(() => {
    if (sourceEvent) return eventFormValuesFromEvent(sourceEvent, WEEK_MS);
    const lastStart = (group?.access === "MEMBER" ? group.events : [])
      .map((event) => new Date(event.startsAt))
      .sort((a, b) => b.getTime() - a.getTime())[0];
    if (!lastStart) return EMPTY_EVENT_FORM_VALUES;
    const next = nextWeeklyStart(lastStart, new Date());
    return { ...EMPTY_EVENT_FORM_VALUES, date: toDateInput(next), startTime: toTimeInput(next) };
  }, [group, sourceEvent]);

  // The date and time the organizer has chosen (or the default) drive the suggestion.
  const startsAt = startsAtFromValues(applyEdits(startDefaults, edits));
  const suggestion = trpc.events.suggestDefaults.useQuery(
    { groupId: group?.id ?? "", startsAt: startsAt ?? new Date(0) },
    {
      enabled: !fromSlug && isOrganizer && startsAt !== null,
      // Keep showing the last suggestion while a new date's is on its way, so the form doesn't blank out.
      placeholderData: keepPreviousData,
    },
  ).data;

  // Layer 2: the suggestion. Layer 3: what the organizer typed.
  const values = applyEdits(suggestion ? eventFormValuesFromSuggestion(startDefaults, suggestion) : startDefaults, edits);

  const createEvent = trpc.events.create.useMutation({
    // Straight to the game with the share sheet open (UI spec §10.3, step 8).
    onSuccess: (event) => router.push(`/e/${event.slug}?share=1`),
  });

  if (isLoading) {
    return <ScreenSkeleton backHref={`/g/${slug}`} />;
  }

  if (!group) {
    return (
      <Screen topBar={<TopBar backHref="/" title="New game" />}>
        <EmptyState icon="info" title="Group not found" description="Check the link, or ask the organizer to send it again." />
      </Screen>
    );
  }

  if (me && !isOrganizer) {
    return (
      <Screen topBar={<TopBar backHref={`/g/${slug}`} title="New game" />}>
        <EmptyState icon="lock" title="Only the organizer can post games" description={`${group.name}’s organizer creates games here.`} />
      </Screen>
    );
  }

  function submit() {
    requireAuth(() =>
      void requireEmail(() => {
        if (!group) return;
        createEvent.mutate({ groupId: group.id, ...eventFormToInput(values) });
      }),
    );
  }

  return (
    <Screen
      topBar={<TopBar backHref={`/g/${slug}`} title="New game" />}
      actionBar={
        <StickyActionBar context="Anyone with the link can join once it’s published">
          <Button type="submit" form={FORM_ID} size="lg" fullWidth loading={createEvent.isPending}>
            Publish game
          </Button>
        </StickyActionBar>
      }
    >
      {sourceEvent && (
        <p className="text-small text-text-secondary">Copied from {sourceEvent.title}. Check the date and price.</p>
      )}
      <EventForm
        formId={FORM_ID}
        values={values}
        onChange={(next, changed) => setEdits((current) => recordEdit(current, next, changed))}
        onSubmit={submit}
        error={createEvent.error?.message}
        lastGame={suggestion?.basedOnTitle ? { title: suggestion.basedOnTitle } : undefined}
        titleIsSuggested={suggestion !== undefined && !edits.touched.has("title")}
      />
      <SignInSheet {...signInSheetProps} />
      <VerifyEmailSheet {...verifyEmailSheetProps} reason="to organize games" />
    </Screen>
  );
}
