import { consoleEmailSender } from "@/server/integrations/email/console";
import { fakeEmailSender } from "@/server/integrations/email/fake";
import type { EmailSender } from "@/server/integrations/email/types";

export type { EmailSender, SendEmailInput } from "@/server/integrations/email/types";

/**
 * Picks the email adapter for the current process. No real provider is
 * wired up yet (specs/tasks.md, pending from Tech Lead), so outside tests
 * messages are logged locally.
 */
export function getEmailSender(): EmailSender {
  return process.env.VITEST ? fakeEmailSender : consoleEmailSender;
}
