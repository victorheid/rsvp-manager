import webpush from "web-push";
import type { PushMessage, PushSender, PushSubscriptionInput } from "@/server/integrations/push/types";

/** HTTP status codes a push service uses for "this subscription is dead". */
const GONE_STATUS_CODES = [404, 410];

export function createWebPushSender(config: { subject: string; publicKey: string; privateKey: string }): PushSender {
  return {
    async send(subscription: PushSubscriptionInput, message: PushMessage) {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(message), {
          vapidDetails: config,
          TTL: 60 * 60 * 24,
        });
        return { gone: false };
      } catch (error) {
        if (error instanceof webpush.WebPushError && GONE_STATUS_CODES.includes(error.statusCode)) {
          return { gone: true };
        }
        throw error;
      }
    },
  };
}
