import type { Db } from "@/server/db";
import { costBreakdownSchema } from "@/server/domains/events/costBreakdown";

/**
 * Public event view (§4): spots left, price/range, cut-off, who's in.
 * No account needed to call this.
 */
export async function getEventBySlug(db: Db, slug: string) {
  const event = await db.event.findUnique({
    where: { slug },
    include: {
      rsvps: {
        where: { status: "GOING" },
        include: { user: { select: { firstName: true, lastInitial: true } } },
      },
      group: { select: { name: true, slug: true } },
    },
  });

  if (!event) {
    return null;
  }

  // costBreakdown is a JSON column — parsed at the boundary (CLAUDE.md),
  // never trusted as already-shaped just because we wrote it ourselves.
  const costBreakdown = costBreakdownSchema.safeParse(event.costBreakdown).data ?? [];

  return { ...event, costBreakdown };
}
