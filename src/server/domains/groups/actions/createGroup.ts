import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { authRules } from "@/server/domains/auth";
import { isValidSlug, slugify } from "@/server/domains/groups/rules";

export interface CreateGroupInput {
  organizerId: string;
  name: string;
  description?: string;
}

/**
 * Finds the first unused slug starting from `baseSlug`, trying `-2`, `-3`,
 * etc. on a collision (§1: "Thursday Basketball" created twice shouldn't
 * fail the whole create).
 */
async function nextAvailableSlug(db: Db, baseSlug: string): Promise<string> {
  const existing = await db.group.findMany({
    where: { slug: { startsWith: baseSlug } },
    select: { slug: true },
  });
  const taken = new Set(existing.map((group) => group.slug));

  if (!taken.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (taken.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

/**
 * Creates a group with a shareable slug and makes the organizer its first
 * member (§1). The organizer must have a verified email. One business operation, one transaction.
 */
export async function createGroup(db: Db, input: CreateGroupInput) {
  // Organizers need a verified email (recovery channel); players never do.
  const organizer = await db.user.findUniqueOrThrow({ where: { id: input.organizerId } });
  const emailProblem = authRules.organizerEmailProblem(organizer);

  if (emailProblem) {
    throw new TRPCError({ code: "FORBIDDEN", message: emailProblem });
  }

  const baseSlug = slugify(input.name);

  if (!isValidSlug(baseSlug)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Group name doesn't produce a usable link — try adding more detail.",
    });
  }

  return db.$transaction(async (tx) => {
    const slug = await nextAvailableSlug(tx, baseSlug);

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
