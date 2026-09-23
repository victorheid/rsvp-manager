import { describe, expect, it } from "vitest";
import { canRefundOnline, isPayoutDue, owedCents, payoutAmountCents, payoutDueAt, refundableCents } from "./rules";

const endsAt = new Date("2026-10-02T19:00:00Z");

describe("payout timing", () => {
  it("is due two days after the event ends", () => {
    expect(payoutDueAt({ endsAt })).toEqual(new Date("2026-10-04T19:00:00Z"));
  });

  it("is due only for a confirmed, unpaid event whose time has come", () => {
    const due = new Date("2026-10-04T19:00:00Z");
    expect(isPayoutDue({ status: "CONFIRMED", endsAt }, false, new Date(due.getTime() - 1))).toBe(false);
    expect(isPayoutDue({ status: "CONFIRMED", endsAt }, false, due)).toBe(true);
    expect(isPayoutDue({ status: "CONFIRMED", endsAt }, true, due)).toBe(false);
    expect(isPayoutDue({ status: "CANCELLED", endsAt }, false, due)).toBe(false);
    expect(isPayoutDue({ status: "OPEN", endsAt }, false, due)).toBe(false);
  });

  it("allows online refunds until the payout is due", () => {
    expect(canRefundOnline({ endsAt }, new Date("2026-10-04T18:59:59Z"))).toBe(true);
    expect(canRefundOnline({ endsAt }, new Date("2026-10-04T19:00:00Z"))).toBe(false);
  });
});

describe("refundableCents", () => {
  const paid = { status: "SUCCEEDED", amountCents: 800, feeCents: 50, refundedCents: 0, feeRefundedCents: 0 } as const;

  it("refunds the price only, unless the fee is included (cancelled event)", () => {
    expect(refundableCents(paid, false)).toEqual({ priceCents: 800, feeCents: 0 });
    expect(refundableCents(paid, true)).toEqual({ priceCents: 800, feeCents: 50 });
  });

  it("counts what was already refunded", () => {
    expect(refundableCents({ ...paid, refundedCents: 800 }, true)).toEqual({ priceCents: 0, feeCents: 50 });
    expect(refundableCents({ ...paid, refundedCents: 800, feeRefundedCents: 50 }, true)).toEqual({ priceCents: 0, feeCents: 0 });
  });

  it("refunds nothing that never succeeded", () => {
    expect(refundableCents({ ...paid, status: "FAILED" }, true)).toEqual({ priceCents: 0, feeCents: 0 });
    expect(refundableCents({ ...paid, status: "PENDING" }, true)).toEqual({ priceCents: 0, feeCents: 0 });
  });
});

describe("owedCents", () => {
  it("is price plus the fee as charged", () => {
    expect(owedCents({ amountCents: 800, feeCents: 50 })).toBe(850);
  });
});

describe("payoutAmountCents", () => {
  it("sums successful game payments less price refunds, ignoring fees, top-ups and failures", () => {
    expect(
      payoutAmountCents([
        { kind: "GAME_CARD", status: "SUCCEEDED", amountCents: 800, refundedCents: 0 },
        { kind: "GAME_WALLET", status: "SUCCEEDED", amountCents: 800, refundedCents: 800 },
        { kind: "GAME_CARD", status: "SUCCEEDED", amountCents: 800, refundedCents: 300 },
        { kind: "GAME_CARD", status: "FAILED", amountCents: 800, refundedCents: 0 },
        { kind: "TOP_UP", status: "SUCCEEDED", amountCents: 5000, refundedCents: 0 },
      ]),
    ).toBe(1300);
  });
});
