import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EventStatus, RsvpStatus } from "@/generated/prisma/enums";
import { notifyEventAudience } from "@/server/domains/events/actions/notifyEventAudience";
import { notificationRules } from "@/server/domains/notifications";
import { lockPriceAndRealizeHolds } from "@/server/domains/events/actions/lockPriceAndRealizeHolds";
import { chargeCardRsvpsForEvent } from "@/server/domains/payments";
import type { PaymentGateway } from "@/server/integrations/stripe";

export interface ConfirmEventInput {
  eventId: string;
  organizerId: string;
}

/**
 * Manual or auto confirm (§3), organizer only. Locks the per-head price
 * against current headcount and flips status, then returns the confirmed
 * event plus its going RSVPs. Wallet holds are realized inside
 * the transaction; card charges go out after commit (see CLAUDE.md: never
 * call an external service inside a transaction). A failed card charge
 * marks that person "owes" — it never undoes the confirmation.
 */
export async function confirmEvent(db: Db, gateway: PaymentGateway, input: ConfirmEventInput, now: Date = new Date()) {
  const result = await db.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: {
        rsvps: { where: { status: RsvpStatus.GOING } },
        group: { select: { organizerId: true } },
      },
    });

    if (!event) {
      throw new TRPCError({ code: "NOT_FOUND" });
    }

    if (event.group.organizerId !== input.organizerId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can confirm this event." });
    }

    if (event.status !== EventStatus.OPEN) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Event is ${event.status.toLowerCase()}, not open.`,
      });
    }

    const headcount = event.rsvps.length;

    if (headcount < event.minPlayers) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Minimum players not met.",
      });
    }

    return lockPriceAndRealizeHolds(tx, input.eventId, now);
  });

  // §5: card RSVPs are charged now the price is locked — after commit, since it calls the provider.
  await chargeCardRsvpsForEvent(db, gateway, { eventId: input.eventId });

  await notifyEventAudience(db, {
    eventId: input.eventId,
    message: notificationRules.eventConfirmedMessage(result.event),
    includeWaitlist: false,
    exceptUserId: input.organizerId,
  });

  return result;
}
