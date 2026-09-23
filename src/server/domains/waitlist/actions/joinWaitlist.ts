import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { RsvpStatus, WaitlistPromotionMode } from "@/generated/prisma/enums";
import { rsvpRules } from "@/server/domains/rsvps";
import { isWaitlistOpen } from "@/server/domains/waitlist/rules";

export interface JoinWaitlistInput {
  eventId: string;
  userId: string;
}

/**
 * Joins the waitlist in "Notify me" mode (§6) — the only mode available
 * until wallet/card exist (§5), since "Auto-join and pay" needs a payment
 * method to charge automatically. No payment method is picked; claiming a
 * spot later is a normal RSVP; cash is allowed.
 */
export async function joinWaitlist(db: Db, input: JoinWaitlistInput) {
  return db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: { rsvps: { where: { status: RsvpStatus.GOING } } },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Event not found." });
    }

    if (!isWaitlistOpen(event, new Date())) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The waitlist is closed — the event has started." });
    }

    if (rsvpRules.hasCapacity(event, event.rsvps.length)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This event isn't full — just RSVP." });
    }

    const existingRsvp = event.rsvps.find((rsvp) => rsvp.userId === input.userId);
    if (existingRsvp) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You're already in." });
    }

    return tx.waitlistEntry.upsert({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
      create: { eventId: input.eventId, userId: input.userId, promotionMode: WaitlistPromotionMode.MANUAL },
      update: {},
    });
  });
}
