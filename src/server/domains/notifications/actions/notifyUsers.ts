import type { Db } from "@/server/db";
import { isMoneyRelated, smsBody, type NotificationMessage } from "@/server/domains/notifications/rules";
import { getPushSender } from "@/server/integrations/push";
import { getSmsSender } from "@/server/integrations/sms";

export interface NotifyUsersInput {
  userIds: readonly string[];
  message: NotificationMessage;
}

/**
 * Sends one message to every device of the given users (§9); money-related
 * messages also go to their phone number by SMS. Best effort:
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

  await Promise.all([pushToDevices(db, input), textMoneyMessages(db, input)]);
}

async function pushToDevices(db: Db, input: NotifyUsersInput) {
  const push = getPushSender();
  const subscriptions = await db.pushSubscription.findMany({ where: { userId: { in: [...input.userIds] } } });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        const { gone } = await push.send(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          { title: input.message.title, body: input.message.body, url: input.message.url },
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

async function textMoneyMessages(db: Db, input: NotifyUsersInput) {
  if (!isMoneyRelated(input.message.kind)) {
    return;
  }

  const sms = getSmsSender();
  const users = await db.user.findMany({ where: { id: { in: [...input.userIds] } }, select: { phoneNumber: true } });
  const body = smsBody(input.message, process.env.APP_URL);

  await Promise.all(
    users.map(async (user) => {
      try {
        await sms.send({ to: user.phoneNumber, body });
      } catch (error) {
        console.error("[notifications] sms failed", error);
      }
    }),
  );
}
