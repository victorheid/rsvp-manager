import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentMethod, RsvpStatus, WaitlistPromotionMode } from "@/generated/prisma/enums";
import { eventRules } from "@/server/domains/events";
import { assertWalletEnabled } from "@/server/domains/wallet";
import { isWaitlistOpen } from "@/server/domains/waitlist/rules";
import type { PaymentGateway } from "@/server/integrations/stripe";

export interface WaitlistPreference {
  mode: WaitlistPromotionMode;
  /** Auto-join only: what to pay with when moved in. Cash can't be taken automatically (§6). */
  paymentMethod?: typeof PaymentMethod.WALLET | typeof PaymentMethod.CARD;
  /** Auto-join with a card: the SetupIntent the browser confirmed (see `rsvps.beginCardSetup`). */
  setupIntentId?: string;
}

export interface JoinWaitlistInput {
  eventId: string;
  userId: string;
  /** Defaults to notify-me. */
  preference?: WaitlistPreference;
}

/**
 * What an entry stores for a preference (§6): nothing for notify-me (no
 * payment method until they claim a spot), or the wallet / saved card for
 * auto-join. Checks the event takes online payments and, for a card, that
 * it was really saved. Calls the provider for the card, so run it outside
 * a transaction.
 */
export async function resolveWaitlistPreference(
  db: Db,
  gateway: PaymentGateway,
  eventId: string,
  preference: WaitlistPreference,
) {
  if (preference.mode === WaitlistPromotionMode.MANUAL) {
    return {
      promotionMode: WaitlistPromotionMode.MANUAL,
      paymentMethod: null,
      stripePaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
    };
  }

  const event = await db.event.findUnique({ where: { id: eventId } });

  if (!event?.onlineAllowed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Auto-join needs online payments — this event doesn't take them." });
  }

  if (preference.paymentMethod === PaymentMethod.WALLET) {
    assertWalletEnabled();
    return {
      promotionMode: WaitlistPromotionMode.AUTO,
      paymentMethod: PaymentMethod.WALLET,
      stripePaymentMethodId: null,
      cardBrand: null,
      cardLast4: null,
    };
  }

  if (preference.paymentMethod === PaymentMethod.CARD) {
    const setup = preference.setupIntentId ? await gateway.retrieveSetupIntent(preference.setupIntentId) : null;

    if (setup?.status !== "succeeded") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Your card wasn't saved — try again." });
    }

    return {
      promotionMode: WaitlistPromotionMode.AUTO,
      paymentMethod: PaymentMethod.CARD,
      stripePaymentMethodId: setup.card.paymentMethodId,
      cardBrand: setup.card.brand,
      cardLast4: setup.card.last4,
    };
  }

  throw new TRPCError({ code: "BAD_REQUEST", message: "Choose wallet or card to be moved in automatically." });
}

/**
 * Joins the waitlist (§6), either in "Notify me" mode (no payment method;
 * claiming a spot later is a normal RSVP, cash allowed) or "Auto-join and
 * pay" (wallet, or a card saved now — nothing is held or charged until
 * they're moved in). Joining again is a no-op: it never moves anyone's
 * place or changes their choice — `setWaitlistMode` does that.
 */
export async function joinWaitlist(db: Db, gateway: PaymentGateway, input: JoinWaitlistInput, now: Date) {
  const preference = await resolveWaitlistPreference(db, gateway, input.eventId, input.preference ?? { mode: WaitlistPromotionMode.MANUAL });

  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: { rsvps: { where: { status: RsvpStatus.GOING } } },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
    }

    if (!isWaitlistOpen(event, now)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The waitlist is closed — the event has started." });
    }

    if (eventRules.hasCapacity(event, event.rsvps.filter(eventRules.countsTowardMax).length)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This event isn't full — just RSVP." });
    }

    const existingRsvp = event.rsvps.find((rsvp) => rsvp.userId === input.userId);
    if (existingRsvp) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You're already in." });
    }

    return tx.waitlistEntry.upsert({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      create: { eventId: input.eventId, userId: input.userId, ...preference },
      update: {},
    });
  });
}
