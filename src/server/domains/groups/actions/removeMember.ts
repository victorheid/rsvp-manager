import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { memberRowActions } from "@/server/domains/groups/rules";

export interface RemoveMemberInput {
  groupId: string;
  organizerId: string;
  memberUserId: string;
}

/**
 * Removes someone from the group (§1). They stop seeing the group and
 * hearing about new games. RSVPs they already made stay; the organizer
 * handles those per game from Manage. They can rejoin with a link that
 * still works, so the organizer may want to reset it too.
 */
export async function removeMember(db: Db, input: RemoveMemberInput) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { organizerId: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  const actions = memberRowActions({
    viewerIsOrganizer: group.organizerId === input.organizerId,
    memberIsOrganizer: group.organizerId === input.memberUserId,
  });

  if (!actions.includes("REMOVE")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can remove members, and not themselves." });
  }

  await db.groupMembership.deleteMany({ where: { groupId: input.groupId, userId: input.memberUserId } });
}
