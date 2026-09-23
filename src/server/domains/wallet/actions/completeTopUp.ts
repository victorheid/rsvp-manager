import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentKind, PaymentRecordStatus, WalletEntryKind } from "@/generated/prisma/enums";
import { lockWallet } from "@/server/domains/wallet/actions/lockWallet";
import { MAX_WALLET_BALANCE_CENTS } from "@/server/domains/wallet/rules";
import type { PaymentGateway } from "@/server/integrations/stripe";

export interface CompleteTopUpInput {
  userId: string;
  paymentId: string;
}

export type CompleteTopUpResult =
  | { status: "pending" }
  | { status: "failed" }
  | { status: "succeeded"; balanceCents: number }
  // Two top-ups raced past the cap: the second was refunded in full instead of credited.
  | { status: "refunded" };

/**
 * Finishes a top-up once the browser has confirmed the payment (§5): asks
 * the provider what happened and, if the money arrived, credits the wallet
 * — once, however many times this is called (the return page, a webhook).
 * The provider is asked outside the transaction; only our own rows change
 * inside it.
 */
export async function completeTopUp(
  db: Db,
  gateway: PaymentGateway,
  input: CompleteTopUpInput,
): Promise<CompleteTopUpResult> {
  const payment = await db.payment.findUnique({ where: { id: input.paymentId } });

  if (!payment || payment.userId !== input.userId || payment.kind !== PaymentKind.TOP_UP) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (payment.status === PaymentRecordStatus.SUCCEEDED) {
    const wallet = await db.wallet.findUniqueOrThrow({ where: { userId: input.userId } });
    return { status: "succeeded", balanceCents: wallet.balanceCents };
  }

  if (payment.status === PaymentRecordStatus.FAILED || !payment.providerIntentId) {
    return { status: "failed" };
  }

  const intent = await gateway.retrievePaymentIntent(payment.providerIntentId);

  if (intent.status === "pending") {
    return { status: "pending" };
  }

  if (intent.status === "failed") {
    await db.payment.updateMany({
      where: { id: payment.id, status: PaymentRecordStatus.PENDING },
      data: { status: PaymentRecordStatus.FAILED },
    });
    return { status: "failed" };
  }

  const outcome = await db.$transaction(async (tx) => {
    const wallet = await lockWallet(tx, input.userId);
    // Claim the payment: whoever flips it out of PENDING first does the crediting.
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: PaymentRecordStatus.PENDING },
      data: { status: PaymentRecordStatus.SUCCEEDED, providerChargeId: intent.chargeId },
    });

    if (claimed.count === 0) {
      return { kind: "already-done" as const, balanceCents: wallet.balanceCents };
    }

    if (wallet.balanceCents + payment.amountCents > MAX_WALLET_BALANCE_CENTS) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentRecordStatus.FAILED } });
      return { kind: "over-cap" as const };
    }

    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balanceCents: { increment: payment.amountCents } },
    });
    await tx.walletEntry.create({
      data: { walletId: wallet.id, kind: WalletEntryKind.TOP_UP, amountCents: payment.amountCents, paymentId: payment.id },
    });

    return { kind: "credited" as const, balanceCents: updated.balanceCents };
  });

  if (outcome.kind === "over-cap") {
    // After commit, never inside the transaction: hand the whole payment back, fee included.
    await gateway.refund({
      chargeId: intent.chargeId,
      amountCents: payment.amountCents + payment.feeCents,
      idempotencyKey: `top-up-over-cap:${payment.id}`,
    });
    return { status: "refunded" };
  }

  return { status: "succeeded", balanceCents: outcome.balanceCents };
}
