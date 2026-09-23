import type { EmailSender, SendEmailInput } from "@/server/integrations/email/types";

/** In-memory fake for feature tests: read `sentMessages` to recover a code sent to an address. */
class FakeEmailSender implements EmailSender {
  sentMessages: SendEmailInput[] = [];

  async send(input: SendEmailInput) {
    this.sentMessages.push(input);
  }

  reset() {
    this.sentMessages = [];
  }

  lastMessageTo(to: string): SendEmailInput | undefined {
    return [...this.sentMessages].reverse().find((message) => message.to === to);
  }
}

export const fakeEmailSender = new FakeEmailSender();
