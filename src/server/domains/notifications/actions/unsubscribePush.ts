import type { Db } from "@/server/db";

export interface UnsubscribePushInput {
  userId: string;
  endpoint: string;
}

/** Forgets this device (the user turned notifications off). Only their own subscription. */
export async function unsubscribePush(db: Db, input: UnsubscribePushInput) {
  await db.pushSubscription.deleteMany({ where: { userId: input.userId, endpoint: input.endpoint } });
}
