import type { Db } from "@/server/db";

/**
 * Returns the user's wallet (creating it on first use) with its row locked
 * until the surrounding transaction ends, so two concurrent RSVPs or
 * top-ups can't both spend the same balance. Private plumbing for this
 * domain's actions: call it only inside a transaction.
 */
export async function lockWallet(tx: Db, userId: string) {
  const wallet = await tx.wallet.upsert({ where: { userId }, create: { userId }, update: {} });
  await tx.$queryRaw`SELECT id FROM "Wallet" WHERE id = ${wallet.id} FOR UPDATE`;

  // Re-read: the balance may have changed while we waited for the lock.
  return tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
}
