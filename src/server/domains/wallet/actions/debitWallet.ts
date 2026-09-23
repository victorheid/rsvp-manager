import type { Db } from "@/server/db";
import { PaymentKind, PaymentRecordStatus, WalletEntryKind } from "@/generated/prisma/enums";

/**
 * Takes a game's price out of a (locked) wallet and records it: balance
 * down, a ledger entry, and a payment with no service fee (§5: none on
 * wallet payments). Shared by hold realization and immediate charges.
 */
export async function debitWalletForGame(
  tx: Db,
  input: { walletId: string; userId: string; rsvpId: string; priceCents: number; feeScheduleId: string },
) {
  const payment = await tx.payment.create({
    data: {
      userId: input.userId,
      rsvpId: input.rsvpId,
      kind: PaymentKind.GAME_WALLET,
      status: PaymentRecordStatus.SUCCEEDED,
      amountCents: input.priceCents,
      feeCents: 0,
      feeScheduleId: input.feeScheduleId,
    },
  });

  await tx.wallet.update({ where: { id: input.walletId }, data: { balanceCents: { decrement: input.priceCents } } });
  await tx.walletEntry.create({
    data: { walletId: input.walletId, kind: WalletEntryKind.GAME_PAYMENT, amountCents: -input.priceCents, paymentId: payment.id },
  });

  return payment;
}
