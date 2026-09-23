import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import type { Db } from "@/server/db";
import { PaymentKind, PaymentRecordStatus, PaymentStatus } from "@/generated/prisma/enums";
import { owedCents } from "@/server/domains/payments/rules";
import { getOrCreateCustomerId } from "@/server/domains/wallet";
import type { PaymentGateway } from "@/server/integrations/stripe";

/** The RSVP behind a pay link, if it really is this user's and still owes. */
async function loadOwedRsvp(db: Db, input: { token: string; userId: string }) {
  const rsvp = await db.rsvp.findUnique({ where: { payToken: input.token }, include: { event: true } });

  if (!rsvp || rsvp.userId !== input.userId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const payment = await db.payment.findFirst({
    where: { rsvpId: rsvp.id, kind: PaymentKind.GAME_CARD, status: { not: PaymentRecordStatus.SUCCEEDED } },
    orderBy: { createdAt: "desc" },
  });

  if (rsvp.paymentStatus !== PaymentStatus.OWES || !payment) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "There's nothing left to pay." });
  }

  if (rsvp.event.status === "CANCELLED" || rsvp.event.status === "EXPIRED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This game isn't happening any more." });
  }

  return { rsvp, payment };
}

/** What the pay page shows (§5 "Failed card charge"; UI spec §7.6). */
export async function getOwedPayment(db: Db, input: { token: string; userId: string }) {
  const { rsvp, payment } = await loadOwedRsvp(db, input);

  return {
    event: { title: rsvp.event.title, slug: rsvp.event.slug, startsAt: rsvp.event.startsAt },
    priceCents: payment.amountCents,
    feeCents: payment.feeCents,
    totalCents: owedCents(payment),
  };
}

/**
 * Starts paying what a failed charge left owing (§5): a fresh payment
 * intent for the same price and the fee as originally charged — never
 * recalculated — that the browser confirms.
 */
export async function startOwedPayment(db: Db, gateway: PaymentGateway, input: { token: string; userId: string }) {
  const { rsvp, payment } = await loadOwedRsvp(db, input);
  const customerId = await getOrCreateCustomerId(db, gateway, input.userId);
  const intent = await gateway.createPaymentIntent({
    customerId,
    amountCents: owedCents(payment),
    idempotencyKey: `pay-link:${payment.id}:${randomUUID()}`,
    description: `${rsvp.event.title} (${rsvp.event.slug})`,
  });
  await db.payment.update({
    where: { id: payment.id },
    data: { status: PaymentRecordStatus.PENDING, providerIntentId: intent.paymentIntentId },
  });

  return { clientSecret: intent.clientSecret, totalCents: owedCents(payment) };
}

export type CompleteOwedPaymentResult = { status: "pending" } | { status: "failed" } | { status: "paid" };

/** Finishes a pay-link payment once the browser confirmed it: marks it paid, once. */
export async function completeOwedPayment(
  db: Db,
  gateway: PaymentGateway,
  input: { token: string; userId: string },
): Promise<CompleteOwedPaymentResult> {
  const rsvp = await db.rsvp.findUnique({ where: { payToken: input.token } });

  if (!rsvp || rsvp.userId !== input.userId) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (rsvp.paymentStatus === PaymentStatus.CHARGED) {
    return { status: "paid" };
  }

  const payment = await db.payment.findFirst({
    where: { rsvpId: rsvp.id, kind: PaymentKind.GAME_CARD, providerIntentId: { not: null } },
    orderBy: { createdAt: "desc" },
  });

  if (!payment?.providerIntentId) {
    return { status: "failed" };
  }

  const intent = await gateway.retrievePaymentIntent(payment.providerIntentId);

  if (intent.status === "pending") {
    return { status: "pending" };
  }

  if (intent.status === "failed") {
    await db.payment.update({ where: { id: payment.id }, data: { status: PaymentRecordStatus.FAILED } });
    return { status: "failed" };
  }

  await db.$transaction(async (tx) => {
    const claimed = await tx.rsvp.updateMany({
      where: { id: rsvp.id, paymentStatus: PaymentStatus.OWES },
      data: { paymentStatus: PaymentStatus.CHARGED },
    });

    if (claimed.count === 1) {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: PaymentRecordStatus.SUCCEEDED, providerChargeId: intent.chargeId },
      });
    }
  });

  return { status: "paid" };
}
