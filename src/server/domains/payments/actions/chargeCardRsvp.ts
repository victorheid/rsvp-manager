import { randomBytes } from "node:crypto";
import type { Db } from "@/server/db";
import { PaymentKind, PaymentMethod, PaymentRecordStatus, PaymentStatus, RsvpStatus } from "@/generated/prisma/enums";
import { feeRules, getFeeScheduleById } from "@/server/domains/fees";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { owedCents } from "@/server/domains/payments/rules";
import { getOrCreateCustomerId } from "@/server/domains/wallet";
import type { PaymentGateway } from "@/server/integrations/stripe";

export type ChargeCardRsvpResult = "charged" | "owes" | "skipped";

/**
 * Charges a card RSVP its locked price plus the service fee (§5): at
 * confirmation, or right after joining an already-confirmed event. The fee
 * comes from the schedule the event pinned at creation and is stored as
 * charged. A decline, an expired card or a 3-D Secure request marks the
 * person "owes" and sends them a pay link instead of failing anything.
 *
 * Runs after the RSVP/confirmation has committed — it calls the provider,
 * so never inside a transaction. Idempotent: the provider call is keyed by
 * the RSVP, and anything not still waiting to be charged is skipped.
 */
export async function chargeCardRsvp(db: Db, gateway: PaymentGateway, input: { rsvpId: string }): Promise<ChargeCardRsvpResult> {
  const rsvp = await db.rsvp.findUniqueOrThrow({ where: { id: input.rsvpId }, include: { event: true } });
  const { event } = rsvp;

  if (
    rsvp.paymentMethod !== PaymentMethod.CARD ||
    rsvp.status !== RsvpStatus.GOING ||
    rsvp.paymentStatus !== PaymentStatus.PENDING ||
    rsvp.userId === null ||
    event.lockedPriceCents === null
  ) {
    return "skipped";
  }

  const priceCents = event.lockedPriceCents;

  if (priceCents === 0) {
    await db.rsvp.update({ where: { id: rsvp.id }, data: { paymentStatus: PaymentStatus.CHARGED } });
    return "charged";
  }

  const schedule = await getFeeScheduleById(db, event.feeScheduleId);
  const feeCents = feeRules.feeForAmountCents(schedule.gameCardFeeTiers, priceCents);
  const existing = await db.payment.findFirst({
    where: { rsvpId: rsvp.id, kind: PaymentKind.GAME_CARD, status: PaymentRecordStatus.PENDING },
  });
  const payment =
    existing ??
    (await db.payment.create({
      data: {
        userId: rsvp.userId,
        rsvpId: rsvp.id,
        kind: PaymentKind.GAME_CARD,
        amountCents: priceCents,
        feeCents,
        feeScheduleId: schedule.id,
      },
    }));

  const result = rsvp.stripePaymentMethodId
    ? await gateway.chargeSavedCard({
        customerId: await getOrCreateCustomerId(db, gateway, rsvp.userId),
        paymentMethodId: rsvp.stripePaymentMethodId,
        amountCents: owedCents(payment),
        idempotencyKey: `rsvp:${rsvp.id}:game-card`,
        description: `${event.title} (${event.slug})`,
      })
    : { outcome: "declined" as const, reason: "card_declined" as const };

  if (result.outcome === "succeeded") {
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: { status: PaymentRecordStatus.SUCCEEDED, providerChargeId: result.chargeId },
      }),
      db.rsvp.update({ where: { id: rsvp.id }, data: { paymentStatus: PaymentStatus.CHARGED } }),
    ]);
    return "charged";
  }

  const payToken = rsvp.payToken ?? randomBytes(16).toString("hex");
  await db.$transaction([
    db.payment.update({ where: { id: payment.id }, data: { status: PaymentRecordStatus.FAILED } }),
    db.rsvp.update({ where: { id: rsvp.id }, data: { paymentStatus: PaymentStatus.OWES, payToken } }),
  ]);
  await notifyUsers(db, {
    userIds: [rsvp.userId],
    message: notificationRules.paymentFailedMessage(event, payToken, owedCents(payment)),
  });

  return "owes";
}

/** Charges every card RSVP of a just-confirmed event; one person's failure doesn't stop the rest. */
export async function chargeCardRsvpsForEvent(db: Db, gateway: PaymentGateway, input: { eventId: string }) {
  const rsvps = await db.rsvp.findMany({
    where: {
      eventId: input.eventId,
      status: RsvpStatus.GOING,
      paymentMethod: PaymentMethod.CARD,
      paymentStatus: PaymentStatus.PENDING,
    },
    select: { id: true },
  });

  for (const rsvp of rsvps) {
    try {
      await chargeCardRsvp(db, gateway, { rsvpId: rsvp.id });
    } catch (error) {
      console.error(`[payments] charging rsvp ${rsvp.id} failed`, error);
    }
  }
}
