import { describe, expect, it } from "vitest";
import {
  allowedTopUpAmountsCents,
  availableBalanceCents,
  canCover,
  MAX_WALLET_BALANCE_CENTS,
  topUpBlockedReason,
} from "./rules";

describe("topUpBlockedReason", () => {
  it.each([
    [0, 2000, null],
    [0, 5000, null],
    [0, 10_000, null],
    [5000, 10_000, null], // lands exactly on the €150 cap
    [5001, 10_000, "WOULD_EXCEED_MAX"],
    [14_000, 2000, "WOULD_EXCEED_MAX"],
    [15_000, 2000, "WOULD_EXCEED_MAX"],
    [0, 1000, "INVALID_AMOUNT"], // below the €20 minimum
    [0, 3000, "INVALID_AMOUNT"], // not one of the fixed amounts
    [0, -2000, "INVALID_AMOUNT"],
  ] as const)("balance %d + top-up %d → %s", (balance, amount, reason) => {
    expect(topUpBlockedReason(balance, amount)).toBe(reason);
  });
});

describe("allowedTopUpAmountsCents", () => {
  it("offers everything on an empty wallet", () => {
    expect(allowedTopUpAmountsCents(0)).toEqual([2000, 5000, 10_000]);
  });

  it("drops the amounts that would exceed the cap", () => {
    expect(allowedTopUpAmountsCents(9000)).toEqual([2000, 5000]);
    expect(allowedTopUpAmountsCents(MAX_WALLET_BALANCE_CENTS)).toEqual([]);
  });
});

describe("available balance", () => {
  it("is balance minus holds", () => {
    expect(availableBalanceCents(2000, 850)).toBe(1150);
  });

  it("covers an amount up to and including what's available", () => {
    expect(canCover(850, 850)).toBe(true);
    expect(canCover(849, 850)).toBe(false);
  });
});
