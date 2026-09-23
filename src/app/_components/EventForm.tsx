"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Banner,
  Button,
  KeyFact,
  SegmentedControl,
  Stepper,
  StatusChip,
  TextArea,
  TextField,
  ToggleRow,
} from "@/components/ui";
import { formatCents, formatDateTime } from "@/lib/format";
import { trpc } from "@/lib/trpc/client";
import { useRequireVerifiedEmail } from "./useRequireVerifiedEmail";
import { VerifyEmailSheet } from "./VerifyEmailSheet";
import { perHeadPriceCents, splitPriceRangeCents } from "@/server/domains/events/rules";
import type { EventFormValues } from "./eventFormValues";

/**
 * The create and edit event form (UI spec §10.3, §10.4). One scrolling
 * form in sections — When, Title, then the details — with the date first:
 * once it's picked, the title, end time, cut-off and everything else can
 * default from the group's last game.
 *
 * When there IS a last game (`lastGame`), the details collapse into a
 * "Same as your last game" summary with a "Change details" button, so a
 * repeat game is date → Publish. Without one (a group's first game, or
 * editing) every field is shown.
 *
 * The form is controlled: the caller owns `values`, and `onChange` says
 * which field changed so the caller can stop auto-filling fields the
 * organizer has edited. It renders no submit button — put one in a
 * `StickyActionBar` with `form={formId}`.
 */
export interface EventFormProps {
  formId: string;
  values: EventFormValues;
  onChange: (next: EventFormValues, changed: keyof EventFormValues) => void;
  onSubmit: () => void;
  error?: string;
  /** Present when the details were defaulted from a previous game. */
  lastGame?: { title: string };
  /** The title still holds the auto-suggestion (the organizer hasn't typed one). */
  titleIsSuggested?: boolean;
}

function playersSummary(values: EventFormValues): string {
  return values.noMax
    ? `${values.minPlayers}+ players`
    : `${values.minPlayers} to ${values.maxPlayers} players`;
}

/** Price as players will see it: "€8.00 each", "€6.67–€10.00 each". Null until an amount is entered. */
function pricePreview(values: EventFormValues): string | null {
  const totalCostCents = Math.round(Number(values.totalCostEuros) * 100);
  if (!Number.isFinite(totalCostCents) || totalCostCents <= 0) return null;

  const pricing = { pricingMode: values.pricingMode, totalCostCents };

  if (values.pricingMode === "FIXED_PER_HEAD") {
    return `${formatCents(perHeadPriceCents(pricing, 1))} each`;
  }

  const range = splitPriceRangeCents(pricing, Math.max(values.minPlayers, 1), values.noMax ? null : values.maxPlayers);
  return range.minCents === null
    ? `Up to ${formatCents(range.maxCents)} each`
    : `${formatCents(range.minCents)}–${formatCents(range.maxCents)} each`;
}

function hoursBefore(startsAt: Date, cutoffAt: Date): string {
  const hours = Math.round((startsAt.getTime() - cutoffAt.getTime()) / (60 * 60 * 1000));
  return hours > 0 ? `${hours} hours before the start` : "At the start";
}

export function EventForm({ formId, values, onChange, onSubmit, error, lastGame, titleIsSuggested = false }: EventFormProps) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const showSummary = lastGame !== undefined && !detailsExpanded;

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    onChange({ ...values, [key]: value }, key);
  }

  const preview = pricePreview(values);
  const startsAt = values.date && values.startTime ? new Date(`${values.date}T${values.startTime}`) : null;
  const cutoffAt = values.cutoff ? new Date(values.cutoff) : null;

  return (
    <form
      id={formId}
      className="flex flex-col gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Section title="When" hint={lastGame ? "Pick the date first. We’ll fill in the rest from your last game." : undefined}>
        <TextField label="Date" type="date" required value={values.date} onChange={(e) => set("date", e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Starts"
            type="time"
            required
            value={values.startTime}
            onChange={(e) => set("startTime", e.target.value)}
          />
          <TextField label="Ends" type="time" required value={values.endTime} onChange={(e) => set("endTime", e.target.value)} />
        </div>
        <TextField label="Location" required value={values.location} onChange={(e) => set("location", e.target.value)} />
      </Section>

      <Section title="Title">
        {titleIsSuggested && (
          <p className="flex items-center gap-2 text-small text-text-secondary">
            <StatusChip tone="accent">Suggested</StatusChip>
            {lastGame ? "from the date and your last game" : "from the date and your group name"}
          </p>
        )}
        <TextField
          label="Game title"
          required
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          helper={titleIsSuggested ? "Edit it and we’ll stop changing it when you change the date." : undefined}
        />
        <TextArea
          label="Description (optional)"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Section>

      {showSummary ? (
        <Section title="Same as your last game" hint="Change anything that’s different this week.">
          <div className="flex flex-col gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
            <KeyFact icon="users" primary={playersSummary(values)} secondary={`Game confirms once ${values.minPlayers} are in`} />
            <KeyFact
              icon="wallet"
              primary={values.pricingMode === "FIXED_PER_HEAD" ? "Fixed per person" : `Split the cost · ${formatCents(Math.round(Number(values.totalCostEuros) * 100))} total`}
              secondary={preview ?? undefined}
            />
            <KeyFact
              icon="lock"
              primary={paymentSummary(values)}
              secondary={values.onlineAllowed ? "Card payments add a service fee for players" : undefined}
            />
            {startsAt && cutoffAt && (
              <KeyFact
                icon="clock"
                primary={`Confirms ${formatDateTime(cutoffAt)}`}
                secondary={hoursBefore(startsAt, cutoffAt)}
              />
            )}
            <Button variant="secondary" fullWidth onClick={() => setDetailsExpanded(true)}>
              Change details
            </Button>
          </div>
        </Section>
      ) : (
        <>
          <Section title="Players" hint="The game only confirms once the minimum is in.">
            <Stepper
              label="Min players"
              hint="Game confirms once this many are in"
              value={values.minPlayers}
              min={1}
              onChange={(n) => set("minPlayers", n)}
            />
            <ToggleRow
              label="No maximum"
              description={values.noMax ? "As many players as want to join." : undefined}
              checked={values.noMax}
              onChange={(checked) => set("noMax", checked)}
            />
            {!values.noMax && (
              <Stepper
                label="Max players"
                hint="Once it’s full, new players join the waitlist"
                value={values.maxPlayers}
                min={values.minPlayers}
                onChange={(n) => set("maxPlayers", n)}
              />
            )}
          </Section>

          <Section title="Price">
            <SegmentedControl
              label="Pricing mode"
              value={values.pricingMode}
              onChange={(mode) => set("pricingMode", mode)}
              options={[
                { value: "FIXED_PER_HEAD", label: "Fixed per person" },
                { value: "SPLIT_EVENLY", label: "Split the cost" },
              ]}
            />
            <TextField
              label={values.pricingMode === "FIXED_PER_HEAD" ? "Amount per person (€)" : "Total cost (€)"}
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              required
              value={values.totalCostEuros}
              onChange={(e) => set("totalCostEuros", e.target.value)}
              helper={values.pricingMode === "SPLIT_EVENLY" ? "Everyone who plays splits this evenly." : undefined}
            />
            {preview && <Banner tone="info" title={`Players pay ${preview}`} />}
          </Section>

          <Section title="How players pay">
            <ToggleRow
              label="Cash on the day"
              description="Players pay you in person. No fees."
              checked={values.cashAllowed}
              onChange={(checked) => set("cashAllowed", checked)}
            />
            <OnlinePayments
              checked={values.onlineAllowed}
              onChange={(checked) => set("onlineAllowed", checked)}
              cashAllowed={values.cashAllowed}
            />
          </Section>

          <Section title="Confirmation">
            <TextField
              label="Confirms on"
              type="datetime-local"
              required
              value={values.cutoff}
              onChange={(e) => set("cutoff", e.target.value)}
              helper={`At this time, if at least ${values.minPlayers} are in, the game confirms. Before this, anyone can drop out for free.`}
            />
            <ToggleRow
              label="Confirm automatically"
              description={
                values.autoChargeAtCutoff ? undefined : "You’ll confirm it yourself. Nobody is charged until you do."
              }
              checked={values.autoChargeAtCutoff}
              onChange={(checked) => set("autoChargeAtCutoff", checked)}
            />
          </Section>
        </>
      )}

      {error && (
        <Banner tone="danger" title="Couldn’t save this game">
          {error}
        </Banner>
      )}
    </form>
  );
}

function paymentSummary(values: EventFormValues): string {
  if (values.onlineAllowed) return values.cashAllowed ? "Online (wallet, card) or cash" : "Online only (wallet, card)";
  return values.cashAllowed ? "Cash on the day" : "No way to pay yet";
}

/**
 * "Wallet and card" (§5): available once the organizer has finished payout
 * onboarding with the payment provider — until then the toggle is off and a
 * button starts it (they leave for the provider's page and come back here,
 * where their status is refreshed). Cash-only games never need it.
 */
function OnlinePayments({ checked, onChange, cashAllowed }: { checked: boolean; onChange: (checked: boolean) => void; cashAllowed: boolean }) {
  const utils = trpc.useUtils();
  const { data: status } = trpc.payouts.onboardingStatus.useQuery();
  const refresh = trpc.payouts.refreshOnboarding.useMutation({ onSuccess: () => utils.payouts.onboardingStatus.invalidate() });
  const start = trpc.payouts.startOnboarding.useMutation({ onSuccess: ({ url }) => window.location.assign(url) });
  const { mutate: refreshStatus } = refresh;
  const { requireEmail, verifyEmailSheetProps } = useRequireVerifiedEmail();

  // Coming back from the provider's page: ask whether onboarding finished.
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  if (!status) return null;

  if (!status.payoutsEnabled) {
    return (
      <Banner tone="info" title="Take online payments">
        Players can pay by wallet or card once you’ve set up payouts. It takes a few minutes: your ID and bank details, with our payment partner. Cash games don’t need it.
        <div className="mt-3">
          <Button
            variant="secondary"
            loading={start.isPending}
            onClick={() => void requireEmail(() => start.mutate({ returnPath: `${window.location.pathname}${window.location.search}` }))}
          >
            {status.started ? "Finish payout setup" : "Set up payouts"}
          </Button>
        </div>
        {start.error && <p className="mt-2 text-small">{start.error.message}</p>}
        <VerifyEmailSheet {...verifyEmailSheetProps} reason="before taking online payments" />
      </Banner>
    );
  }

  return (
    <ToggleRow
      label="Wallet and card"
      description={
        checked
          ? `Players pay online. You’re paid the full price two days after the game${cashAllowed ? "" : ", and there’s no cash option"}. Card payments carry a service fee for the player.`
          : "Players pay by wallet or card. You’re paid out after the game."
      }
      checked={checked}
      onChange={onChange}
    />
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-title text-text-primary">{title}</h2>
        {hint && <p className="text-small text-text-secondary">{hint}</p>}
      </div>
      {children}
    </section>
  );
}
