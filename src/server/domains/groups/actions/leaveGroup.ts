import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { canLeaveGroup } from "@/server/domains/groups/rules";

export interface LeaveGroupInput {
  groupId: string;
  userId: string;
}

/**
 * Leaves a group (§1). RSVPs already made stay: dropping out of a game is
 * a separate step with its own payment rules (§4). Rejoining needs a
 * working invite link.
 */
export async function leaveGroup(db: Db, input: LeaveGroupInput) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { organizerId: true, memberships: { where: { userId: input.userId }, select: { id: true } } },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const allowed = canLeaveGroup({
    isMember: group.memberships.length > 0,
    isOrganizer: group.organizerId === input.userId,
  });

  if (!allowed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: group.organizerId === input.userId ? "The organizer can't leave their own group." : "You're not a member of this group.",
    });
  }

  await db.groupMembership.deleteMany({ where: { groupId: input.groupId, userId: input.userId } });
}
