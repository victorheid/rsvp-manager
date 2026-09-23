import type { Db } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";
import { paymentRules } from "@/server/domains/payments";
import { refreshOnboarding } from "@/server/domains/payouts/actions/refreshOnboarding";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * §5: pays organizers for events that have finished and stayed unrefunded
 * long enough (event end + 2 days). The organizer gets the full price of
 * every successful online payment less refunds — service fees stay with
 * us, and cash never went through the platform. Each event is paid once;
 * an organizer who hasn't finished onboarding is skipped and picked up on
 * a later run, once they have. System-triggered (the background worker).
 *
 * The transfer is keyed by the event, so a crash between the transfer and
 * writing the Payout row can't pay twice.
 */
export async function releaseDuePayouts(db: Db, gateway: PaymentGateway, now: Date) {
  const candidates = await db.event.findMany({
    where: {
      status: EventStatus.CONFIRMED,
      payout: null,
      endsAt: { lte: new Date(now.getTime() - paymentRules.PAYOUT_DELAY_MS) },
    },
    include: { group: { select: { organizerId: true, organizer: true } } },
  });

  const released = [];

  for (const event of candidates) {
    if (!paymentRules.isPayoutDue(event, false, now)) {
      continue;
    }

    try {
      const amountCents = paymentRules.payoutAmountCents(
        await db.payment.findMany({ where: { rsvp: { eventId: event.id } } }),
      );
      let transferId: string | null = null;

      if (amountCents > 0) {
        const { payoutsEnabled } = await refreshOnboarding(db, gateway, { userId: event.group.organizerId });
        const accountId = event.group.organizer.stripeAccountId;

        if (!payoutsEnabled || !accountId) {
          console.warn(`[payouts] organizer of ${event.slug} hasn't finished onboarding — payout waits`);
          continue;
        }

        ({ transferId } = await gateway.payout({
          accountId,
          amountCents,
          idempotencyKey: `payout:${event.id}`,
          description: `${event.title} (${event.slug})`,
        }));
      }

      await db.payout.create({
        data: { eventId: event.id, organizerId: event.group.organizerId, amountCents, providerTransferId: transferId, releasedAt: now },
      });
      released.push({ event, amountCents });
    } catch (error) {
      console.error(`[payouts] paying out ${event.slug} failed`, error);
    }
  }

  return released;
}
