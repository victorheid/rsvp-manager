import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentMethod, PaymentStatus, RsvpStatus } from "@/generated/prisma/enums";
import { joinGroupById } from "@/server/domains/groups";
import { countsTowardMax, hasCapacity, isJoinableEventStatus } from "@/server/domains/rsvps/rules";

export interface CreateRsvpInput {
  eventId: string;
  userId: string;
  paymentMethod: PaymentMethod;
}

/**
 * Joins an event (§4), auto-joining its group (§1). Only cash RSVPs work
 * for now — wallet/card need the wallet and Stripe integrations, which
 * don't exist yet (specs/tasks.md §5); asking for either fails clearly
 * instead of pretending to charge.
 */
export async function createRsvp(db: Db, input: CreateRsvpInput) {
  return db.$transaction(async (tx) => {
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

    if (input.paymentMethod !== PaymentMethod.CASH) {
      // TODO(wallet/stripe domains): wire up WALLET/CARD once those
      // integrations exist (specs/tasks.md §5).
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Online payments aren't set up yet — cash only for now.",
      });
    }

    if (!event.cashAllowed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This event doesn't accept cash RSVPs.",
      });
    }

    const existing = await tx.rsvp.findUnique({
      where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
    });

    if (existing?.status === RsvpStatus.GOING) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "You're already in." });
    }

    if (!hasCapacity(event, event.rsvps.filter(countsTowardMax).length)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This event is full — join the waitlist instead." });
    }

    const rsvp = existing
      ? await tx.rsvp.update({
          where: { id: existing.id },
          data: {
            status: RsvpStatus.GOING,
            paymentMethod: input.paymentMethod,
            paymentStatus: PaymentStatus.PENDING,
            attended: null,
          },
        })
      : await tx.rsvp.create({
          data: {
            eventId: input.eventId,
            userId: input.userId,
            paymentMethod: input.paymentMethod,
            paymentStatus: PaymentStatus.PENDING,
          },
        });

    await joinGroupById(tx, { groupId: event.groupId, userId: input.userId });

    // §6: "Claiming the spot is a normal RSVP" — clear any waitlist entry
    // now that they're going, so they don't show up in both places.
    await tx.waitlistEntry.deleteMany({ where: { eventId: input.eventId, userId: input.userId } });

    return rsvp;
  });
}
