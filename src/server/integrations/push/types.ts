import { z } from "zod";

/** A browser's Web Push subscription, as `PushManager.subscribe()` serialises it. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification goes, e.g. `/e/friday-game`. */
  url: string;
}

export interface PushSender {
  /**
   * Delivers one message to one device. Returns `{ gone: true }` when the
   * push service says the subscription no longer exists (user revoked
   * permission, cleared site data), so the caller can delete it.
   */
  send(subscription: PushSubscriptionInput, message: PushMessage): Promise<{ gone: boolean }>;
}
