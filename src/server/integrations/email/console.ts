import type { EmailSender, SendEmailInput } from "@/server/integrations/email/types";

/**
 * Local-dev stand-in until a real provider (Resend, Postmark or similar) is
 * wired up: prints the message, so verification codes are readable in the
 * server log.
 */
export const consoleEmailSender: EmailSender = {
  async send(input: SendEmailInput) {
    console.log(`[email:dev] to ${input.to}: ${input.subject} — ${input.body}`);
  },
};
