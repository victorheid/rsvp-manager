import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { isValidSlug, slugify } from "@/server/domains/groups/rules";

export interface CreateGroupInput {
  organizerId: string;
  name: string;
  description?: string;
}

/**
 * Creates a group with a shareable slug and makes the organizer its first
 * member (§1). One business operation, one transaction.
 */
export async function createGroup(db: Db, input: CreateGroupInput) {
  const slug = slugify(input.name);

  if (!isValidSlug(slug)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Group name doesn't produce a usable link — try adding more detail.",
    });
  }

  // TODO: slug collisions ("Thursday Basketball" created twice) currently
  // fail with a raw DB constraint error. Decide the UX (suffix? reject with
  // a friendly message?) before this ships — see specs/tasks.md §1.
  return db.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        slug,
        name: input.name,
        description: input.description,
        organizerId: input.organizerId,
      },
    });

    await tx.groupMembership.create({
      data: { groupId: group.id, userId: input.organizerId },
    });

    return group;
  });
}
