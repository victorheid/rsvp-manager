import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";

export interface JoinGroupByIdInput {
  groupId: string;
  userId: string;
}

/**
 * Joins a group by id (§1). Idempotent: RSVPing or tapping "Join group"
 * again is a no-op, not an error. Takes a plain `Db` so a caller already
 * inside a transaction (e.g. rsvps' createRsvp, auto-joining the group)
 * can pass its transaction client straight through.
 */
export async function joinGroupById(db: Db, input: JoinGroupByIdInput) {
  return db.groupMembership.upsert({
    where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    create: { groupId: input.groupId, userId: input.userId },
    update: {},
  });
}

export interface JoinGroupInput {
  slug: string;
  userId: string;
}

/** Joins a group via its shareable link. */
export async function joinGroup(db: Db, input: JoinGroupInput) {
  const group = await db.group.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
  }

  return joinGroupById(db, { groupId: group.id, userId: input.userId });
}
