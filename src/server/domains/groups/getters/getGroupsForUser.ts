import type { Db } from "@/server/db";

/** UI spec §6 (Games/Home): the groups a signed-in user is a member of. */
export async function getGroupsForUser(db: Db, userId: string) {
  return db.group.findMany({
    where: { memberships: { some: { userId } } },
    orderBy: { name: "asc" },
  });
}
