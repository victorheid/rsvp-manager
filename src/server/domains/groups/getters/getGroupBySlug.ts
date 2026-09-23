import type { Db } from "@/server/db";
import { RsvpStatus } from "@/generated/prisma/enums";

export interface GetGroupBySlugOptions {
  /** Signed-in viewer, if any — used to flag their own membership. */
  viewerId?: string;
}

/**
 * Public group view (§1, UI spec §5): no account needed. Returns null
 * rather than throwing so the router/caller decides how to surface
 * "not found".
 */
export async function getGroupBySlug(db: Db, slug: string, options: GetGroupBySlugOptions = {}) {
  const group = await db.group.findUnique({
    where: { slug },
    include: {
      events: {
        orderBy: { startsAt: "asc" },
        include: { _count: { select: { rsvps: { where: { status: RsvpStatus.GOING } } } } },
      },
      _count: { select: { memberships: true } },
    },
  });

  if (!group) {
    return null;
  }

  const isMember = options.viewerId
    ? (await db.groupMembership.findUnique({
        where: { groupId_userId: { groupId: group.id, userId: options.viewerId } },
      })) !== null
    : false;

  const { _count, events, ...rest } = group;

  return {
    ...rest,
    memberCount: _count.memberships,
    isMember,
    events: events.map((event) => {
      const { _count: eventCount, ...eventRest } = event;
      return { ...eventRest, goingCount: eventCount.rsvps };
    }),
  };
}
