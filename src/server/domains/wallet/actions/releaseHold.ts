import type { Db } from "@/server/db";
import { WalletHoldStatus } from "@/generated/prisma/enums";

/**
 * Frees a hold without spending it (§5, §7): the RSVP or event was
 * cancelled or expired before confirmation. Safe to call for an RSVP with
 * no hold, or one already settled — it does nothing then.
 */
export async function releaseHold(tx: Db, input: { rsvpId: string }, now: Date) {
  await tx.walletHold.updateMany({
    where: { rsvpId: input.rsvpId, status: WalletHoldStatus.HELD },
    data: { status: WalletHoldStatus.RELEASED, settledAt: now },
  });
}

/** Releases every hold belonging to these RSVPs — when an event is cancelled or expires (§7). */
export async function releaseHolds(tx: Db, input: { rsvpIds: readonly string[] }, now: Date) {
  await tx.walletHold.updateMany({
    where: { rsvpId: { in: [...input.rsvpIds] }, status: WalletHoldStatus.HELD },
    data: { status: WalletHoldStatus.RELEASED, settledAt: now },
  });
}
