import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";
import { canLeaveGroup, inviteState } from "@/server/domains/groups/rules";

export interface GetGroupBySlugOptions {
  /** Signed-in viewer, if any. */
  viewerId?: string;
  now: Date;
}

/**
 * The group page (§1, UI spec §5). Members-only: anyone else gets just
 * the group's name and organizer, so they know whom to ask for an invite.
 * Only the organizer gets the invite link. Returns null rather than
 * throwing so the router decides how to surface "not found".
 */
export async function getGroupBySlug(db: Db, slug: string, options: GetGroupBySlugOptions) {
  const group = await db.group.findUnique({
    where: { slug },
    include: { organizer: { select: { name: true } } },
  });

  if (!group) {
    return null;
  }

  const outsider = {
    access: "OUTSIDER" as const,
    id: group.id,
    slug: group.slug,
    name: group.name,
    organizerName: group.organizer.name,
  };

  if (!options.viewerId) {
    return outsider;
  }

  const membership = await db.groupMembership.findUnique({
    where: { groupId_userId: { groupId: group.id, userId: options.viewerId } },
  });

  if (!membership) {
    return outsider;
  }

  const [events, memberCount] = await Promise.all([
    db.event.findMany({
      where: { groupId: group.id },
      orderBy: { startsAt: "asc" },
      include: { _count: { select: { rsvps: { where: { status: RsvpStatus.GOING } } } } },
    }),
    db.groupMembership.count({ where: { groupId: group.id } }),
  ]);
  const isOrganizer = group.organizerId === options.viewerId;

  return {
    ...outsider,
    access: "MEMBER" as const,
    description: group.description,
    organizerId: group.organizerId,
    memberCount,
    isOrganizer,
    canLeave: canLeaveGroup({ isMember: true, isOrganizer }),
    invite:
      isOrganizer
        ? { token: group.inviteToken, expiresAt: group.inviteExpiresAt, state: inviteState(group, options.now) }
        : null,
    events: events.map((event) => {
      const { _count: eventCount, ...eventRest } = event;
      return { ...eventRest, goingCount: eventCount.rsvps };
    }),
  };
}
