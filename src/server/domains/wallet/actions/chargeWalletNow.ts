import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { assertWalletEnabled } from "@/server/domains/wallet/actions/assertWalletEnabled";
import { WalletHoldStatus } from "@/generated/prisma/enums";
import { debitWalletForGame } from "@/server/domains/wallet/actions/debitWallet";
import { lockWallet } from "@/server/domains/wallet/actions/lockWallet";
import { availableBalanceCents, canCover } from "@/server/domains/wallet/rules";

export interface ChargeWalletNowInput {
  userId: string;
  rsvpId: string;
  priceCents: number;
  feeScheduleId: string;
}

/**
 * Immediate charge for joining an already-confirmed event (§3, §5): no
 * hold, because the price is already locked. Fails if the available balance
 * (after other holds) can't cover it. Call inside the RSVP's transaction.
 */
export async function chargeWalletNow(tx: Db, input: ChargeWalletNowInput) {
  assertWalletEnabled();
  const wallet = await lockWallet(tx, input.userId);
  const held = await tx.walletHold.aggregate({
    where: { walletId: wallet.id, status: WalletHoldStatus.HELD },
    _sum: { amountCents: true },
  });

  if (!canCover(availableBalanceCents(wallet.balanceCents, held._sum.amountCents ?? 0), input.priceCents)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Not enough in your wallet — top up or pay another way." });
  }

  return debitWalletForGame(tx, { walletId: wallet.id, ...input });
}
