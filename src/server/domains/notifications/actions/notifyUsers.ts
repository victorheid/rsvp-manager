import type { Db } from "@/server/db";
import { getPushSender, type PushMessage } from "@/server/integrations/push";

export interface NotifyUsersInput {
  userIds: readonly string[];
  message: PushMessage;
}

/**
 * Sends one message to every device of the given users (§9). Best effort:
 * a failing push service never fails the action that triggered the
 * notification, so errors are logged and swallowed. Subscriptions the push
 * service reports as gone are deleted.
 *
 * Call it after the triggering action has committed — never from inside a
 * transaction (CLAUDE.md).
 */
export async function notifyUsers(db: Db, input: NotifyUsersInput) {
  if (input.userIds.length === 0) {
    return;
  }

  const push = getPushSender();
  const subscriptions = await db.pushSubscription.findMany({ where: { userId: { in: [...input.userIds] } } });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const { gone } = await push.send(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          input.message,
        );

        if (gone) {
          await db.pushSubscription.deleteMany({ where: { id: subscription.id } });
        }
      } catch (error) {
        console.error("[notifications] push failed", error);
      }
    }),
  );
}
