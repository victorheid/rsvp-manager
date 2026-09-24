import type { Db } from "@/server/db";

/** Whether this person is in the group (§1). Takes a plain `Db` so callers can pass a transaction client. */
export async function isGroupMember(db: Db, input: { groupId: string; userId: string }): Promise<boolean> {
  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
    select: { id: true },
  });

  return membership !== null;
}
