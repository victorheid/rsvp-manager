import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { WalletHoldStatus } from "@/generated/prisma/enums";
import { lockWallet } from "@/server/domains/wallet/actions/lockWallet";
import { availableBalanceCents, canCover } from "@/server/domains/wallet/rules";

export interface PlaceHoldInput {
  userId: string;
  rsvpId: string;
  /** For split pricing, the upper bound (total ÷ min); the difference is released at confirmation. */
  amountCents: number;
}

/**
 * Reserves part of the balance for an RSVP (§5 "Wallet RSVP"): available
 * balance drops, no money moves. Call inside the RSVP's transaction, so the
 * hold exists exactly when the RSVP does.
 */
export async function placeHold(tx: Db, input: PlaceHoldInput) {
  const wallet = await lockWallet(tx, input.userId);
  const held = await tx.walletHold.aggregate({
    where: { walletId: wallet.id, status: WalletHoldStatus.HELD },
    _sum: { amountCents: true },
  });

  if (!canCover(availableBalanceCents(wallet.balanceCents, held._sum.amountCents ?? 0), input.amountCents)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Not enough in your wallet — top up or pay another way." });
  }

  return tx.walletHold.create({
    data: { walletId: wallet.id, rsvpId: input.rsvpId, amountCents: input.amountCents },
  });
}
