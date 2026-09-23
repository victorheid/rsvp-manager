import type { PushMessage, PushSender, PushSubscriptionInput } from "@/server/integrations/push/types";

/** Local-dev stand-in when VAPID keys aren't configured: prints instead of pushing. */
export const consolePushSender: PushSender = {
  async send(subscription: PushSubscriptionInput, message: PushMessage) {
    console.log(`[push:dev] to ${subscription.endpoint.slice(0, 48)}…: ${message.title} — ${message.body} (${message.url})`);
    return { gone: false };
  },
};
