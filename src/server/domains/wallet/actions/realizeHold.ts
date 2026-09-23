import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentKind, WalletHoldStatus } from "@/generated/prisma/enums";
import { debitWalletForGame } from "@/server/domains/wallet/actions/debitWallet";
import { lockWallet } from "@/server/domains/wallet/actions/lockWallet";

export interface RealizeHoldInput {
  userId: string;
  rsvpId: string;
  /** The locked per-head price at confirmation (§3). Never more than the hold. */
  priceCents: number;
  feeScheduleId: string;
}

/**
 * Turns an RSVP's hold into a payment at confirmation (§5): the locked
 * price is debited, and whatever the hold reserved beyond it (split
 * pricing's upper bound) is simply released. Idempotent: an already
 * realized hold returns its payment. Call inside the confirming
 * transaction.
 */
export async function realizeHold(tx: Db, input: RealizeHoldInput, now: Date) {
  const hold = await tx.walletHold.findUnique({ where: { rsvpId: input.rsvpId } });

  if (!hold) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "No wallet hold for this RSVP." });
  }

  if (hold.status === WalletHoldStatus.REALIZED) {
    return tx.payment.findFirstOrThrow({ where: { rsvpId: input.rsvpId, kind: PaymentKind.GAME_WALLET } });
  }

  if (hold.status !== WalletHoldStatus.HELD) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This wallet hold was already released." });
  }

  // Price only ever falls between RSVP and lock (§2), so the hold covers it.
  if (input.priceCents > hold.amountCents) {
    throw new Error(`Locked price ${input.priceCents} exceeds hold ${hold.amountCents}`);
  }

  const wallet = await lockWallet(tx, input.userId);
  const payment = await debitWalletForGame(tx, { walletId: wallet.id, ...input });
  await tx.walletHold.update({ where: { id: hold.id }, data: { status: WalletHoldStatus.REALIZED, settledAt: now } });

  return payment;
}
