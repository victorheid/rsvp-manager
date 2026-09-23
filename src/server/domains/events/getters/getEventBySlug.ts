import type { Db } from "@/server/db";

/**
 * Public event view (§4): spots left, price/range, cut-off, who's in.
 * No account needed to call this.
 */
export async function getEventBySlug(db: Db, slug: string) {
  return db.event.findUnique({
    where: { slug },
    include: {
      rsvps: {
        where: { status: "GOING" },
        include: { user: { select: { firstName: true, lastInitial: true } } },
      },
      group: { select: { name: true, slug: true } },
    },
  });
}
