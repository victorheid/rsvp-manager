export interface SendSmsInput {
  to: string;
  body: string;
}

export interface SmsSender {
  send(input: SendSmsInput): Promise<void>;
}
