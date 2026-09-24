import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";

export interface StopInviteLinkInput {
  groupId: string;
  organizerId: string;
}

/** Closes the group to new members (§1): the current link stops working. Organizer only. */
export async function stopInviteLink(db: Db, input: StopInviteLinkInput) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { organizerId: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can change its invite link." });
  }

  await db.group.update({
    where: { id: input.groupId },
    data: { inviteToken: null, inviteExpiresAt: null },
  });
}
