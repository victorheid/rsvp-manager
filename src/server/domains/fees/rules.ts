import { z } from "zod";

/**
 * Business rules for service fees (spec §5). Pure functions only: no
 * Prisma calls, no Date.now(), no I/O.
 *
 * A fee schedule is a set of tiers by amount: the fee is the one on the
 * first tier whose `upToCents` covers the amount. The last tier of a
 * schedule that must price any amount has `upToCents: null` ("and above").
 */

export const feeTierSchema = z.object({
  upToCents: z.number().int().positive().nullable(),
  feeCents: z.number().int().nonnegative(),
});

export const feeTiersSchema = z
  .array(feeTierSchema)
  .min(1)
  .refine(
    (tiers) =>
      tiers.every((tier, index) => {
        const next = tiers[index + 1];
        if (tier.upToCents === null) return next === undefined; // "and above" can only close the list
        return next === undefined || next.upToCents === null || next.upToCents > tier.upToCents;
      }),
    "Tiers must be in ascending order, and only the last may be open-ended.",
  );

export type FeeTiers = z.infer<typeof feeTiersSchema>;

/** Version 1 of the schedule (§5). The migration seeds the same numbers; tests re-seed from this. */
export const DEFAULT_FEE_SCHEDULE = {
  id: "fee_schedule_v1",
  version: 1,
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  // §5: €0.50 flat per card payment for a game.
  gameCardFeeTiers: [{ upToCents: null, feeCents: 50 }],
  // §5: €20 → €1, €50 → €1.50, €100 → €2.50.
  topUpFeeTiers: [
    { upToCents: 2000, feeCents: 100 },
    { upToCents: 5000, feeCents: 150 },
    { upToCents: 10000, feeCents: 250 },
  ],
} as const satisfies {
  id: string;
  version: number;
  effectiveFrom: Date;
  gameCardFeeTiers: FeeTiers;
  topUpFeeTiers: FeeTiers;
};

/** The fee for an amount under a set of tiers. Throws if no tier covers it: an amount we haven't priced shouldn't be charged. */
export function feeForAmountCents(tiers: FeeTiers, amountCents: number): number {
  const tier = tiers.find((candidate) => candidate.upToCents === null || amountCents <= candidate.upToCents);

  if (!tier) {
    throw new Error(`No fee tier covers ${amountCents} cents`);
  }

  return tier.feeCents;
}

/**
 * §5 "Changing fees": which schedule applies now — the latest one whose
 * effective date has arrived. Schedules are never edited, only superseded.
 */
export function currentSchedule<T extends { effectiveFrom: Date; version: number }>(
  schedules: readonly T[],
  now: Date,
): T | undefined {
  return schedules
    .filter((schedule) => schedule.effectiveFrom <= now)
    .sort((a, b) => b.version - a.version)[0];
}
