/**
 * Business rules for the wallet (spec §5). Pure functions only: no Prisma
 * calls, no Date.now(), no I/O. Money is integer cents, EUR only.
 */

/** §5: top up in fixed amounts — €20 (minimum), €50, €100. */
export const TOP_UP_AMOUNTS_CENTS = [2000, 5000, 10_000] as const;

/** §5 "Wallet limits": one balance cap keeps us inside the low-value e-money thresholds. */
export const MAX_WALLET_BALANCE_CENTS = 15_000;

export type TopUpBlockedReason = "INVALID_AMOUNT" | "WOULD_EXCEED_MAX";

/** Why a top-up can't go ahead, or null if it can. */
export function topUpBlockedReason(balanceCents: number, amountCents: number): TopUpBlockedReason | null {
  if (!TOP_UP_AMOUNTS_CENTS.some((allowed) => allowed === amountCents)) {
    return "INVALID_AMOUNT";
  }

  return balanceCents + amountCents > MAX_WALLET_BALANCE_CENTS ? "WOULD_EXCEED_MAX" : null;
}

/** The top-up amounts offered right now — those that wouldn't push the balance over the cap (§5). */
export function allowedTopUpAmountsCents(balanceCents: number): number[] {
  return TOP_UP_AMOUNTS_CENTS.filter((amount) => topUpBlockedReason(balanceCents, amount) === null);
}

/** §5: a hold reduces what can be spent without moving any money. */
export function availableBalanceCents(balanceCents: number, heldCents: number): number {
  return balanceCents - heldCents;
}

/** Whether the wallet can take on a new hold or charge of this size. */
export function canCover(availableCents: number, amountCents: number): boolean {
  return amountCents <= availableCents;
}

/**
 * Whether the wallet is switched on. Until the legal check on holding
 * balances clears (specs/tasks.md, blockers) it's off in production unless
 * `WALLET_ENABLED=true`; everywhere else it's on unless `WALLET_ENABLED=false`.
 */
export function isWalletEnabled(env: { WALLET_ENABLED?: string; NODE_ENV?: string }): boolean {
  if (env.WALLET_ENABLED === "true") return true;
  if (env.WALLET_ENABLED === "false") return false;
  return env.NODE_ENV !== "production";
}
