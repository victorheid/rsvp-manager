import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PaymentKind, PaymentStatus } from "@/generated/prisma/enums";
import { notificationRules, notifyUsers } from "@/server/domains/notifications";
import { owedCents } from "@/server/domains/payments/rules";

/**
 * Sends someone who owes for a failed card charge their pay link again
 * (§5, §8) — same push and SMS as the first time. The caller has already
 * checked the requester organizes this event.
 */
export async function resendPayLink(db: Db, input: { rsvpId: string }) {
  const rsvp = await db.rsvp.findUniqueOrThrow({ where: { id: input.rsvpId }, include: { event: true } });
  const payment = await db.payment.findFirst({
    where: { rsvpId: rsvp.id, kind: PaymentKind.GAME_CARD },
    orderBy: { createdAt: "desc" },
  });

  if (rsvp.userId === null || rsvp.paymentStatus !== PaymentStatus.OWES || !rsvp.payToken || !payment) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "There's no payment to chase." });
  }

  await notifyUsers(db, {
    userIds: [rsvp.userId],
    message: notificationRules.paymentFailedMessage(rsvp.event, rsvp.payToken, owedCents(payment)),
  });
}
