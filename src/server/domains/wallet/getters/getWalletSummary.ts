import type { Db } from "@/server/db";
import { WalletHoldStatus } from "@/generated/prisma/enums";
import { allowedTopUpAmountsCents, availableBalanceCents, MAX_WALLET_BALANCE_CENTS } from "@/server/domains/wallet/rules";

/** What the wallet screen and the RSVP sheet need: balance, what's on hold, what's spendable, what can be topped up. */
export async function getWalletSummary(db: Db, userId: string) {
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
    allowedTopUpAmountsCents: allowedTopUpAmountsCents(balanceCents),
  };
}
