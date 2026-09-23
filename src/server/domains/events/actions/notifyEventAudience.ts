import type { Db } from "@/server/db";
import { getEventAudience } from "@/server/domains/events/getters/getEventAudience";
import { notifyUsers, type NotificationMessage } from "@/server/domains/notifications";

/**
 * Tells everyone in an event — and, when `includeWaitlist`, everyone on its
 * waitlist — except the person who just did the thing (`exceptUserId`).
 * Runs after the triggering action has committed (CLAUDE.md).
 */
export async function notifyEventAudience(
  db: Db,
  input: { eventId: string; message: NotificationMessage; includeWaitlist: boolean; exceptUserId?: string },
) {
  const audience = await getEventAudience(db, input.eventId);
  const userIds = [...audience.goingUserIds, ...(input.includeWaitlist ? audience.waitlistUserIds : [])].filter(
    (userId) => userId !== input.exceptUserId,
  );

  await notifyUsers(db, { userIds, message: input.message });
}
