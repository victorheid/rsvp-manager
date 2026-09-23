import type { Db } from "@/server/db";
import type { PushSubscriptionInput } from "@/server/integrations/push";

export interface SubscribePushInput {
  userId: string;
  subscription: PushSubscriptionInput;
}

/**
 * Stores this device's push subscription (§9). Idempotent by endpoint: the
 * same browser subscribing again — or a different user signing in on it —
 * takes over the existing row rather than duplicating it.
 */
export async function subscribePush(db: Db, input: SubscribePushInput) {
  const { endpoint, keys } = input.subscription;

  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: input.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    update: { userId: input.userId, p256dh: keys.p256dh, auth: keys.auth },
  });
}
