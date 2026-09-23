import type { Db } from "@/server/db";
import { WalletEntryKind } from "@/generated/prisma/enums";
import { lockWallet } from "@/server/domains/wallet/actions/lockWallet";

/**
 * Puts a refunded wallet payment's money back on the balance (§5, §7),
 * with a ledger entry. Call inside the refunding transaction; the caller
 * records the refund on the payment itself.
 */
export async function creditRefund(tx: Db, input: { userId: string; paymentId: string; amountCents: number }) {
  const wallet = await lockWallet(tx, input.userId);

  await tx.wallet.update({ where: { id: wallet.id }, data: { balanceCents: { increment: input.amountCents } } });
  await tx.walletEntry.create({
    data: { walletId: wallet.id, kind: WalletEntryKind.REFUND, amountCents: input.amountCents, paymentId: input.paymentId },
  });
}
