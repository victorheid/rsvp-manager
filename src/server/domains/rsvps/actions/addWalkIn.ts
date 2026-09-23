import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
import { isJoinableEventStatus } from "@/server/domains/rsvps/rules";

export interface AddWalkInInput {
  eventId: string;
  organizerId: string;
  name: string;
  /** §10.6: "Paid cash" or "Owes" — there's no zero-cost status to model "Free" yet. */
  paymentStatus: typeof PaymentStatus.PAID_OUTSIDE_APP | typeof PaymentStatus.OWES;
}

/**
 * Adds a walk-in (§8): a name-only record with no account, tracked as cash
 * since no money moves through the app for them. Doesn't count against
 * max (see countsTowardMax in rules.ts). Organizer only.
 */
export async function addWalkIn(db: Db, input: AddWalkInInput) {
  const event = await db.event.findUnique({
    where: { id: input.eventId },
    include: { group: { select: { organizerId: true } } },
  });

  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (event.group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can add a walk-in." });
  }

  if (!isJoinableEventStatus(event.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `This event is ${event.status.toLowerCase()}.` });
  }

  return db.rsvp.create({
    data: {
      eventId: input.eventId,
      walkInName: input.name,
      paymentMethod: PaymentMethod.CASH,
      paymentStatus: input.paymentStatus,
    },
  });
}
