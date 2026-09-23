import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import type { EventModel } from "@/generated/prisma/models";
import { PaymentMethod, PaymentStatus, RsvpStatus } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { joinGroupById } from "@/server/domains/groups";
import { chargeCardRsvp } from "@/server/domains/payments";
import { chargeWalletNow, placeHold } from "@/server/domains/wallet";
import type { PaymentGateway } from "@/server/integrations/stripe";
import { isJoinableEventStatus } from "@/server/domains/rsvps/rules";

export interface CreateRsvpInput {
  eventId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  /** Card RSVPs: the SetupIntent the browser confirmed with the card (see `beginCardSetup`). */
  setupIntentId?: string;
  /** Or a card already saved (a waitlist entry's, when it's moved in automatically). */
  savedCard?: { paymentMethodId: string; brand: string; last4: string };
}

/**
 * Joins an event (§4), auto-joining its group (§1), with the payment
 * choice the event allows (§5). Nobody is charged just for RSVPing:
 *  - cash: nothing happens until the organizer collects it;
 *  - wallet: a hold reserves the price (for split pricing, the upper
 *    bound) — or, on an already-confirmed event, the locked price is
 *    debited straight away;
 *  - card: the saved card waits for confirmation — or, on an
 *    already-confirmed event, is charged right after the RSVP commits
 *    (never inside the transaction: it calls the provider).
 */
export async function createRsvp(db: Db, gateway: PaymentGateway, input: CreateRsvpInput) {
  // Checked before asking the provider about the card, so a cash-only event says so
  // instead of complaining about a card nobody should have been asked for.
  const preview = await db.event.findUnique({ where: { id: input.eventId } });
  if (preview) {
    assertPaymentMethodAllowed(preview, input.paymentMethod);
  }

  const card =
    input.paymentMethod !== PaymentMethod.CARD
      ? null
      : (input.savedCard ?? (await loadSavedCard(gateway, input.setupIntentId)));

  const { rsvp, event } = await db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: { rsvps: { where: { status: RsvpStatus.GOING } } },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
    }

    if (!isJoinableEventStatus(event.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This event is ${event.status.toLowerCase()}.`,
      });
    }

    assertPaymentMethodAllowed(event, input.paymentMethod);

    const existing = await tx.rsvp.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
    });

    if (existing?.status === RsvpStatus.GOING) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You're already in." });
    }

    if (!eventRules.hasCapacity(event, event.rsvps.filter(eventRules.countsTowardMax).length)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This event is full — join the waitlist instead." });
    }

    // Someone who dropped out after paying and rejoins is still paid up (§4: no auto-refund).
    const stillPaid = existing?.paymentStatus === PaymentStatus.CHARGED;
    const paymentFields = {
      status: RsvpStatus.GOING,
      attended: null,
      ...(stillPaid
        ? {}
        : {
            paymentMethod: input.paymentMethod,
            paymentStatus: PaymentStatus.PENDING,
            stripePaymentMethodId: card?.paymentMethodId ?? null,
            cardBrand: card?.brand ?? null,
            cardLast4: card?.last4 ?? null,
          }),
    };

    const rsvp = existing
      ? await tx.rsvp.update({ where: { id: existing.id }, data: paymentFields })
      : await tx.rsvp.create({
          data: {
            eventId: input.eventId,
            userId: input.userId,
            paymentMethod: input.paymentMethod,
            paymentStatus: PaymentStatus.PENDING,
            stripePaymentMethodId: card?.paymentMethodId,
            cardBrand: card?.brand,
            cardLast4: card?.last4,
          },
        });

    if (input.paymentMethod === PaymentMethod.WALLET && !stillPaid) {
      if (event.lockedPriceCents === null) {
        // Not confirmed yet: reserve the most it could cost (§5).
        await placeHold(tx, {
          userId: input.userId,
          rsvpId: rsvp.id,
          amountCents: eventRules.perHeadPriceCents(event, event.minPlayers),
        });
        await tx.rsvp.update({ where: { id: rsvp.id }, data: { paymentStatus: PaymentStatus.HELD } });
      } else {
        await chargeWalletNow(tx, {
          userId: input.userId,
          rsvpId: rsvp.id,
          priceCents: event.lockedPriceCents,
          feeScheduleId: event.feeScheduleId,
        });
        await tx.rsvp.update({ where: { id: rsvp.id }, data: { paymentStatus: PaymentStatus.CHARGED } });
      }
    }

    await joinGroupById(tx, { groupId: event.groupId, userId: input.userId });

    // §6: "Claiming the spot is a normal RSVP" — clear any waitlist entry
    // now that they're going, so they don't show up in both places.
    await tx.waitlistEntry.deleteMany({ where: { eventId: input.eventId, userId: input.userId } });

    return { rsvp, event };
  });

  // Joining a confirmed event: the price is locked, so the card is charged now (§3).
  if (input.paymentMethod === PaymentMethod.CARD && event.lockedPriceCents !== null) {
    await chargeCardRsvp(db, gateway, { rsvpId: rsvp.id });
  }

  // Re-read: the hold, the charge or a failed charge may have changed the payment status.
  return db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
}

function assertPaymentMethodAllowed(event: Pick<EventModel, "cashAllowed" | "onlineAllowed">, method: PaymentMethod) {
  if (method === PaymentMethod.CASH && !event.cashAllowed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This event doesn't accept cash RSVPs." });
  }

  if (method !== PaymentMethod.CASH && !event.onlineAllowed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This event doesn't accept online payments." });
  }
}

async function loadSavedCard(gateway: PaymentGateway, setupIntentId: string | undefined) {
  const state = setupIntentId ? await gateway.retrieveSetupIntent(setupIntentId) : null;

  if (state?.status !== "succeeded") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Your card wasn't saved — try again." });
  }

  return state.card;
}
