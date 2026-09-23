import type { Db } from "@/server/db";
import { EventStatus } from "@/generated/prisma/enums";
import { isExpired } from "@/server/domains/events/rules";

/**
 * §7: an Open event still unconfirmed 48h after its start expires —
 * nobody was charged, so there's nothing to release yet (holds/refunds
 * are §5, not built). System-triggered, like autoConfirmDueEvents.
 */
export async function expireOverdueEvents(db: Db, now: Date) {
  const candidates = await db.event.findMany({ where: { status: EventStatus.OPEN } });
  const toExpire = candidates.filter((event) => isExpired(event, now));

  if (toExpire.length === 0) {
    return [];
  }

  await db.event.updateMany({
    where: { id: { in: toExpire.map((event) => event.id) } },
    data: { status: EventStatus.EXPIRED },
  });

  return toExpire;
}
