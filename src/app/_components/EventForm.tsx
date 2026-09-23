"use client";

export interface EventFormValues {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  location: string;
  cutoffAt: string;
  minPlayers: number;
  noMax: boolean;
  maxPlayers: number;
  pricingMode: "FIXED_PER_HEAD" | "SPLIT_EVENLY";
  totalCostEuros: string;
  cashAllowed: boolean;
  autoChargeAtCutoff: boolean;
}

export const EMPTY_EVENT_FORM_VALUES: EventFormValues = {
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  location: "",
  cutoffAt: "",
  minPlayers: 1,
  noMax: true,
  maxPlayers: 10,
  pricingMode: "FIXED_PER_HEAD",
  totalCostEuros: "",
  cashAllowed: true,
  autoChargeAtCutoff: true,
};

/**
 * Shared by create ("New game") and edit — same fields either way
 * (§10.3, §10.4). The caller owns the values (controlled) and submit
 * handling; this is just the form body.
 */
export function EventForm({
  values,
  onChange,
  onSubmit,
  submitLabel,
  submitting,
  error,
}: {
  values: EventFormValues;
  onChange: (values: EventFormValues) => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting: boolean;
  error?: string;
}) {
  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          type="text"
          required
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description (optional)
        <textarea
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Starts
          <input
            type="datetime-local"
            required
            value={values.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Ends
          <input
            type="datetime-local"
            required
            value={values.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Location
        <input
          type="text"
          required
          value={values.location}
          onChange={(e) => set("location", e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Confirms on (cut-off)
        <input
          type="datetime-local"
          required
          value={values.cutoffAt}
          onChange={(e) => set("cutoffAt", e.target.value)}
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
            value={values.minPlayers}
            onChange={(e) => set("minPlayers", Number(e.target.value))}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Max players
          <input
            type="number"
            min={values.minPlayers}
            disabled={values.noMax}
            value={values.maxPlayers}
            onChange={(e) => set("maxPlayers", Number(e.target.value))}
            className="rounded-md border border-neutral-300 px-3 py-2 text-base disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.noMax} onChange={(e) => set("noMax", e.target.checked)} />
        No limit
      </label>

      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="mb-1">Price</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="pricingMode"
            checked={values.pricingMode === "FIXED_PER_HEAD"}
            onChange={() => set("pricingMode", "FIXED_PER_HEAD")}
          />
          Fixed per person
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="pricingMode"
            checked={values.pricingMode === "SPLIT_EVENLY"}
            onChange={() => set("pricingMode", "SPLIT_EVENLY")}
          />
          Split the cost
        </label>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm">
        {values.pricingMode === "FIXED_PER_HEAD" ? "Amount per person (€)" : "Total cost (€)"}
        <input
          type="number"
          min={0}
          step="0.01"
          required
          value={values.totalCostEuros}
          onChange={(e) => set("totalCostEuros", e.target.value)}
          className="rounded-md border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-800"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={values.cashAllowed} onChange={(e) => set("cashAllowed", e.target.checked)} />
        Accept cash on the day
      </label>
      <p className="text-xs text-neutral-500">
        Online payment (wallet/card) isn&apos;t available yet — this is the only way to accept payment for now.
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.autoChargeAtCutoff}
          onChange={(e) => set("autoChargeAtCutoff", e.target.checked)}
        />
        Auto-confirm at cut-off if the minimum is met
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
      >
        {submitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
