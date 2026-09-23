import type { SendSmsInput, SmsSender } from "@/server/integrations/sms/types";

/**
 * Local-dev stand-in until a real provider (Twilio or similar) is wired up
 * — see specs/tasks.md §0. Prints the message instead of sending it, so
 * verification codes are readable in the server log during development.
 */
export const consoleSmsSender: SmsSender = {
  async send(input: SendSmsInput) {
    console.log(`[sms:dev] to ${input.to}: ${input.body}`);
  },
};
