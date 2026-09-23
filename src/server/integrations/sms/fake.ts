import type { SendSmsInput, SmsSender } from "@/server/integrations/sms/types";

/**
 * In-memory fake for feature tests (CLAUDE.md: "Mock only external
 * integrations, using fake adapters from integrations/"). Tests read
 * `sentMessages` to recover a verification code sent to a phone number
 * without a real SMS provider.
 */
class FakeSmsSender implements SmsSender {
  sentMessages: SendSmsInput[] = [];

  async send(input: SendSmsInput) {
    this.sentMessages.push(input);
  }

  reset() {
    this.sentMessages = [];
  }

  lastMessageTo(to: string): SendSmsInput | undefined {
    return [...this.sentMessages].reverse().find((message) => message.to === to);
  }
}

export const fakeSmsSender = new FakeSmsSender();
