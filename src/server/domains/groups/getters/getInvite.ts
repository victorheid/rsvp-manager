import type { Db } from "@/server/db";
import { inviteLinkStatus } from "@/server/domains/groups/rules";

/**
 * The invite page behind `/g/{slug}/join/{token}` (§1): enough about the
 * group to decide to join. Public — the token is the permission. A link
 * that doesn't work shows only the group's name. Null when there's no
 * such group.
 */
export async function getInvite(db: Db, input: { slug: string; token: string; viewerId?: string }, now: Date) {
  const group = await db.group.findUnique({
    where: { slug: input.slug },
    include: { organizer: { select: { name: true } }, _count: { select: { memberships: true } } },
  });

  if (!group) {
    return null;
  }

  const isMember = input.viewerId
    ? (await db.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: input.viewerId } },
      })) !== null
    : false;
  const status = inviteLinkStatus(group, input.token, now);
  const base = { status, isMember, name: group.name, organizerName: group.organizer.name };

  if (status !== "VALID") {
    return { ...base, description: null, memberCount: null };
  }

  return { ...base, description: group.description, memberCount: group._count.memberships };
}
