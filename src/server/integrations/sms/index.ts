import { consoleSmsSender } from "@/server/integrations/sms/console";
import { fakeSmsSender } from "@/server/integrations/sms/fake";
import type { SmsSender } from "@/server/integrations/sms/types";

export type { SendSmsInput, SmsSender } from "@/server/integrations/sms/types";

/**
 * Picks the SMS adapter for the current process. Real provider (Twilio or
 * similar) isn't wired up yet — see specs/tasks.md §0 — so non-test
 * environments fall back to logging the message locally.
 */
export function getSmsSender(): SmsSender {
  if (process.env.VITEST) {
    return fakeSmsSender;
  }

  return consoleSmsSender;
}
