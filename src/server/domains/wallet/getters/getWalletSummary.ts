import type { Db } from "@/server/db";
import { WalletHoldStatus } from "@/generated/prisma/enums";
import { feeRules, getCurrentFeeSchedule } from "@/server/domains/fees";
import { allowedTopUpAmountsCents, isWalletEnabled, availableBalanceCents, MAX_WALLET_BALANCE_CENTS } from "@/server/domains/wallet/rules";

/** What the wallet screen and the RSVP sheet need: balance, what's on hold, what's spendable, what can be topped up. */
export async function getWalletSummary(db: Db, userId: string, now: Date) {
  const schedule = await getCurrentFeeSchedule(db, now);
  const wallet = await db.wallet.findUnique({
    where: { userId },
    include: { holds: { where: { status: WalletHoldStatus.HELD }, select: { amountCents: true } } },
  });

  const balanceCents = wallet?.balanceCents ?? 0;
  const heldCents = wallet?.holds.reduce((sum, hold) => sum + hold.amountCents, 0) ?? 0;

  return {
    balanceCents,
    heldCents,
    availableCents: availableBalanceCents(balanceCents, heldCents),
    maxBalanceCents: MAX_WALLET_BALANCE_CENTS,
    enabled: isWalletEnabled(process.env),
    /** What can be topped up right now, with the stepped fee paid on top (§5). */
    topUpOptions: allowedTopUpAmountsCents(balanceCents).map((amountCents) => {
      const feeCents = feeRules.feeForAmountCents(schedule.topUpFeeTiers, amountCents);
      return { amountCents, feeCents, totalCents: amountCents + feeCents };
    }),
    /** The €0.50-style fee a card payment adds, per the current schedule — for the "save by topping up" hint. */
    cardFeeExampleCents: feeRules.feeForAmountCents(schedule.gameCardFeeTiers, 800),
  };
}
