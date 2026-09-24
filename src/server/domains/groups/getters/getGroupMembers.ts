import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { memberRowActions } from "@/server/domains/groups/rules";

/**
 * The members list (§1). Members see names; the organizer also sees phone
 * numbers (to chase payments, UI spec §10.5) and what they can do to each
 * person. The organizer comes first, then everyone by join date.
 */
export async function getGroupMembers(db: Db, input: { slug: string; viewerId: string }) {
  const group = await db.group.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      organizerId: true,
      memberships: {
        orderBy: { joinedAt: "asc" },
        select: { joinedAt: true, user: { select: { id: true, name: true, phoneNumber: true } } },
      },
    },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }

  if (!group.memberships.some((membership) => membership.user.id === input.viewerId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only members can see who's in this group." });
  }

  const viewerIsOrganizer = group.organizerId === input.viewerId;
  const members = group.memberships.map(({ joinedAt, user }) => {
    const isOrganizer = user.id === group.organizerId;
    return {
      userId: user.id,
      name: user.name,
      joinedAt,
      isOrganizer,
      phoneNumber: viewerIsOrganizer ? user.phoneNumber : null,
      actions: memberRowActions({ viewerIsOrganizer, memberIsOrganizer: isOrganizer }),
    };
  });

  return {
    groupId: group.id,
    members: [...members.filter((member) => member.isOrganizer), ...members.filter((member) => !member.isOrganizer)],
  };
}
