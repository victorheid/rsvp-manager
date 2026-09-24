import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { WaitlistEntryStatus } from "@/generated/prisma/enums";
import { advanceWaitlist } from "@/server/domains/waitlist/actions/advanceWaitlist";
import { isHoldActive } from "@/server/domains/waitlist/rules";

export interface LeaveWaitlistInput {
  eventId: string;
  userId: string;
}

/**
 * Leaves the waitlist (§6). Always free — nothing was ever charged. They
 * stay listed under Dropped out, and a spot held for them goes to the next
 * person.
 */
export async function leaveWaitlist(db: Db, input: LeaveWaitlistInput, now: Date) {
  const entry = await db.waitlistEntry.findUnique({
    where: { eventId_userId: { eventId: input.eventId, userId: input.userId } },
  });

  if (!entry || entry.status !== WaitlistEntryStatus.WAITING) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "You're not on the waitlist." });
  }

  return dropFromWaitlist(db, entry, now);
}

/** Shared by leaving and by the organizer marking someone dropped out (§8). */
export async function dropFromWaitlist(
  db: Db,
  entry: { id: string; eventId: string; status: WaitlistEntryStatus; heldUntil: Date | null },
  now: Date,
) {
  const dropped = await db.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: WaitlistEntryStatus.DROPPED_OUT, droppedAt: now, heldUntil: null },
  });

  if (isHoldActive(entry, now)) {
    await advanceWaitlist(db, { eventId: entry.eventId, spotFreed: true }, now);
  }

  return dropped;
}
