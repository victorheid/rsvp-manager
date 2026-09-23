"use client";

import { useParams } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";

function formatCents(cents: number): string {
  return `€${(cents / 100).toFixed(2)}`;
}

const PAYMENT_LABEL: Record<string, string> = {
  PENDING: "Held",
  HELD: "Held",
  CHARGED: "Paid online",
  OWES: "Owes",
  PAID_OUTSIDE_APP: "Paid outside app",
  REFUNDED: "Refunded",
};

type Rsvp = RouterOutputs["rsvps"]["forOrganizer"]["rsvps"][number];

function PersonRow({
  rsvp,
  amountCents,
  onMarkAttendance,
  onMarkPaid,
  onRemove,
}: {
  rsvp: Rsvp;
  amountCents: number;
  onMarkAttendance: (attended: boolean | null) => void;
  onMarkPaid: () => void;
  onRemove: () => void;
}) {
  const canMarkPaid = rsvp.paymentStatus === "PENDING" || rsvp.paymentStatus === "OWES";

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-3 text-sm dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <span className="font-medium">
          {rsvp.user.firstName} {rsvp.user.lastInitial}.
          {rsvp.noShowCount > 0 && (
            <span className="ml-2 text-xs text-neutral-500">{rsvp.noShowCount} no-shows</span>
          )}
          {rsvp.status === "CANCELLED" && (
            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
              Dropped out
            </span>
          )}
        </span>
        <span className="text-neutral-500">
          {PAYMENT_LABEL[rsvp.paymentStatus] ?? rsvp.paymentStatus} {formatCents(amountCents)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-xs dark:border-neutral-700">
          <button
            type="button"
            onClick={() => onMarkAttendance(true)}
            className={`px-2 py-1 ${rsvp.attended === true ? "bg-green-600 text-white" : ""}`}
          >
            Showed
          </button>
          <button
            type="button"
            onClick={() => onMarkAttendance(false)}
            className={`border-l border-neutral-300 px-2 py-1 dark:border-neutral-700 ${rsvp.attended === false ? "bg-red-600 text-white" : ""}`}
          >
            No-show
          </button>
          <button
            type="button"
            onClick={() => onMarkAttendance(null)}
            className={`border-l border-neutral-300 px-2 py-1 dark:border-neutral-700 ${rsvp.attended === null ? "bg-neutral-200 dark:bg-neutral-700" : ""}`}
          >
            –
          </button>
        </div>

        {canMarkPaid && (
          <button type="button" onClick={onMarkPaid} className="text-xs underline">
            Mark paid outside app
          </button>
        )}
        {rsvp.status === "GOING" && (
          <button type="button" onClick={onRemove} className="text-xs text-red-600 underline">
            Remove
          </button>
        )}
      </div>
    </li>
  );
}

export default function ManageEventPage() {
  const { slug } = useParams<{ slug: string }>();
  const utils = trpc.useUtils();
  const { data: event } = trpc.events.getBySlug.useQuery({ slug });
  const { data: view, isLoading } = trpc.rsvps.forOrganizer.useQuery(
    { eventId: event?.id ?? "" },
    { enabled: !!event?.id },
  );

  const invalidate = () => utils.rsvps.forOrganizer.invalidate({ eventId: event?.id ?? "" });
  const markAttendance = trpc.rsvps.markAttendance.useMutation({ onSuccess: invalidate });
  const markPaidOutsideApp = trpc.rsvps.markPaidOutsideApp.useMutation({ onSuccess: invalidate });
  const removeRsvp = trpc.rsvps.remove.useMutation({ onSuccess: invalidate });

  if (!event || isLoading) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  if (!event.isOrganizer) {
    return <main className="mx-auto max-w-2xl p-4">Only the organizer can manage this event.</main>;
  }

  if (!view) {
    return <main className="mx-auto max-w-2xl p-4">Loading…</main>;
  }

  const amountCents =
    event.priceDisplay.mode === "range" ? (event.priceDisplay.maxCents ?? 0) : event.priceDisplay.amountCents;

  const going = view.rsvps.filter((rsvp) => rsvp.status === "GOING");
  const droppedOut = view.rsvps.filter((rsvp) => rsvp.status === "CANCELLED");

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      <div>
        <a href={`/e/${slug}`} className="text-sm text-neutral-500 underline">
          Back to event
        </a>
        <h1 className="text-2xl font-semibold">Manage: {event.title}</h1>
        <p className="text-sm text-neutral-500">
          {going.length} in · needs {event.minPlayers}
          {event.maxPlayers !== null ? ` · ${event.maxPlayers} max` : ""}
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-neutral-500">Going ({going.length})</h2>
        <ul className="flex flex-col gap-2">
          {going.map((rsvp) => (
            <PersonRow
              key={rsvp.id}
              rsvp={rsvp}
              amountCents={amountCents}
              onMarkAttendance={(attended) => markAttendance.mutate({ rsvpId: rsvp.id, attended })}
              onMarkPaid={() => markPaidOutsideApp.mutate({ rsvpId: rsvp.id })}
              onRemove={() => removeRsvp.mutate({ rsvpId: rsvp.id })}
            />
          ))}
          {going.length === 0 && <li className="text-sm text-neutral-500">No one yet.</li>}
        </ul>
      </section>

      {droppedOut.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-neutral-500">Dropped out ({droppedOut.length})</h2>
          <ul className="flex flex-col gap-2">
            {droppedOut.map((rsvp) => (
              <PersonRow
                key={rsvp.id}
                rsvp={rsvp}
                amountCents={amountCents}
                onMarkAttendance={(attended) => markAttendance.mutate({ rsvpId: rsvp.id, attended })}
                onMarkPaid={() => markPaidOutsideApp.mutate({ rsvpId: rsvp.id })}
                onRemove={() => removeRsvp.mutate({ rsvpId: rsvp.id })}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
