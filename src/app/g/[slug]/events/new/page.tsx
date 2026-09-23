"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { SignInFlow } from "@/app/_components/SignInFlow";
import { useRequireAuth } from "@/app/_components/useRequireAuth";

/** UI spec §10.3: create event (trimmed — no cost breakdown editor yet). */
export default function CreateEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: group, isLoading } = trpc.groups.getBySlug.useQuery({ slug });
  const { me, requireAuth, isSigningIn, handleSignedIn, cancelSignIn } = useRequireAuth();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [cutoffAt, setCutoffAt] = useState("");
  const [minPlayers, setMinPlayers] = useState(1);
  const [noMax, setNoMax] = useState(true);
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [pricingMode, setPricingMode] = useState<"FIXED_PER_HEAD" | "SPLIT_EVENLY">("FIXED_PER_HEAD");
  const [totalCostEuros, setTotalCostEuros] = useState("");
  const [cashAllowed, setCashAllowed] = useState(true);
  const [autoChargeAtCutoff, setAutoChargeAtCutoff] = useState(true);

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
        title,
        description: description || undefined,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        location,
        cutoffAt: new Date(cutoffAt),
        minPlayers,
        maxPlayers: noMax ? undefined : maxPlayers,
        totalCostCents: Math.round(Number(totalCostEuros) * 100),
        pricingMode,
        cashAllowed,
        autoChargeAtCutoff,
      });
    });
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-24">
      <h1 className="text-2xl font-semibold">New game for {group.name}</h1>

      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1 text-sm">
          Title
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Starts
            <input
              type="datetime-local"
              required
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Ends
            <input
              type="datetime-local"
              required
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Location
          <input
            type="text"
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Confirms on (cut-off)
          <input
            type="datetime-local"
            required
            value={cutoffAt}
            onChange={(e) => setCutoffAt(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Min players
            <input
              type="number"
              min={1}
              required
              value={minPlayers}
              onChange={(e) => setMinPlayers(Number(e.target.value))}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Max players
            <input
              type="number"
              min={minPlayers}
              disabled={noMax}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="rounded-md border border-neutral-300 px-3 py-2 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={noMax} onChange={(e) => setNoMax(e.target.checked)} />
          No limit
        </label>

        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">Price</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pricingMode"
              checked={pricingMode === "FIXED_PER_HEAD"}
              onChange={() => setPricingMode("FIXED_PER_HEAD")}
            />
            Fixed per person
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="pricingMode"
              checked={pricingMode === "SPLIT_EVENLY"}
              onChange={() => setPricingMode("SPLIT_EVENLY")}
            />
            Split the cost
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          {pricingMode === "FIXED_PER_HEAD" ? "Amount per person (€)" : "Total cost (€)"}
          <input
            type="number"
            min={0}
            step="0.01"
            required
            value={totalCostEuros}
            onChange={(e) => setTotalCostEuros(e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={cashAllowed} onChange={(e) => setCashAllowed(e.target.checked)} />
          Accept cash on the day
        </label>
        <p className="text-xs text-neutral-500">
          Online payment (wallet/card) isn&apos;t available yet — this is the only way to accept payment for now.
        </p>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoChargeAtCutoff}
            onChange={(e) => setAutoChargeAtCutoff(e.target.checked)}
          />
          Auto-confirm at cut-off if the minimum is met
        </label>

        {createEvent.error && <p className="text-sm text-red-600">{createEvent.error.message}</p>}

        {!isSigningIn && (
          <button
            type="submit"
            disabled={createEvent.isPending}
            className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {createEvent.isPending ? "Publishing…" : "Publish"}
          </button>
        )}
      </form>

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
