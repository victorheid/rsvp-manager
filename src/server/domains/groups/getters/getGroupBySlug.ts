import type { Db } from "@/server/db";

/**
 * Public group view (§1): no account needed. Returns null rather than
 * throwing so the router/caller decides how to surface "not found".
 */
export async function getGroupBySlug(db: Db, slug: string) {
  return db.group.findUnique({
    where: { slug },
    include: {
      events: {
        orderBy: { startsAt: "asc" },
      },
    },
  });
}
