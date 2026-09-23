import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";

export interface EditGroupInput {
  groupId: string;
  organizerId: string;
  name: string;
  description?: string;
}

/**
 * Edits a group's name and description (§10.2), organizer only. The slug
 * never changes — links are already shared.
 */
export async function editGroup(db: Db, input: EditGroupInput) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { organizerId: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can edit it." });
  }

  return db.group.update({
    where: { id: input.groupId },
    data: { name: input.name, description: input.description },
  });
}
