import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { inviteLinkStatus } from "@/server/domains/groups/rules";

export interface JoinGroupInput {
  slug: string;
  /** The secret from the invite link. */
  token: string;
  userId: string;
}

/**
 * Joins a group through the organizer's invite link (§1), the only way
 * in. Idempotent: someone who's already a member is let through even if
 * the link has since expired.
 */
export async function joinGroup(db: Db, input: JoinGroupInput, now: Date) {
  const group = await db.group.findUnique({
    where: { slug: input.slug },
    select: { id: true, inviteToken: true, inviteExpiresAt: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
  }

  const key = { groupId_userId: { groupId: group.id, userId: input.userId } };
  const existing = await db.groupMembership.findUnique({ where: key });

  if (existing) {
    return existing;
  }

  const status = inviteLinkStatus(group, input.token, now);

  if (status !== "VALID") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        status === "EXPIRED"
          ? "This invite link has expired. Ask the organizer for a new one."
          : "This invite link no longer works. Ask the organizer for a new one.",
    });
  }

  return db.groupMembership.upsert({
    where: key,
    create: { groupId: group.id, userId: input.userId },
    update: {},
  });
}
