import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import {
  resolveWaitlistPreference,
  type WaitlistPreference,
} from "@/server/domains/waitlist/actions/joinWaitlist";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * Switches a waitlist entry between "Notify me" and "Auto-join and pay"
 * (§6). The entry keeps its original join time, so a switch can only change
 * its place through the auto-join-first ordering.
 */
export async function setWaitlistMode(
  db: Db,
  gateway: PaymentGateway,
  input: { eventId: string; userId: string; preference: WaitlistPreference },
) {
  const entry = await db.waitlistEntry.findUnique({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
  });

  if (!entry) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You're not on the waitlist." });
  }

  const preference = await resolveWaitlistPreference(db, gateway, input.eventId, input.preference);

  return db.waitlistEntry.update({ where: { id: entry.id }, data: preference });
}
