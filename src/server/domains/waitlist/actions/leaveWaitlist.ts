import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";

export interface LeaveWaitlistInput {
  eventId: string;
  userId: string;
}

/** Leaves the waitlist (§6). Always free — nothing was ever charged. */
export async function leaveWaitlist(db: Db, input: LeaveWaitlistInput) {
  const entry = await db.waitlistEntry.findUnique({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
  });

  if (!entry) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You're not on the waitlist." });
  }

  await db.waitlistEntry.delete({ where: { id: entry.id } });
  return { ok: true };
}
