import { z } from "zod";
import { consolePushSender } from "@/server/integrations/push/console";
import { fakePushSender } from "@/server/integrations/push/fake";
import type { PushSender } from "@/server/integrations/push/types";
import { createWebPushSender } from "@/server/integrations/push/webPush";

export { pushSubscriptionSchema } from "@/server/integrations/push/types";
export type { PushMessage, PushSender, PushSubscriptionInput } from "@/server/integrations/push/types";

const vapidEnvSchema = z.object({
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
});

/**
 * Picks the push adapter for the current process: the fake under tests, the
 * real Web Push sender when the VAPID keys are set (see .env.example), and
 * a console logger otherwise.
 */
export function getPushSender(): PushSender {
  if (process.env.VITEST) {
    return fakePushSender;
  }

  const vapid = vapidEnvSchema.safeParse(process.env);

  if (!vapid.success) {
    return consolePushSender;
  }

  return createWebPushSender({
    subject: vapid.data.VAPID_SUBJECT,
    publicKey: vapid.data.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: vapid.data.VAPID_PRIVATE_KEY,
  });
}
