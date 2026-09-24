import type { Db } from "@/server/db";

/** UI spec §6 (Games/Home): the groups a signed-in user is a member of. */
export async function getGroupsForUser(db: Db, userId: string) {
  return db.group.findMany({
    where: { memberships: { some: { userId } } },
    // The invite link is the organizer's to share, from the group page.
    omit: { inviteToken: true, inviteExpiresAt: true },
    orderBy: { name: "asc" },
  });
}
