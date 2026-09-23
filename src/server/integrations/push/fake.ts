import type { PushMessage, PushSender, PushSubscriptionInput } from "@/server/integrations/push/types";

/**
 * In-memory fake for feature tests. Tests read `sent` to see who was
 * notified, and add an endpoint to `goneEndpoints` to simulate a revoked
 * subscription.
 */
class FakePushSender implements PushSender {
  sent: { endpoint: string; message: PushMessage }[] = [];
  goneEndpoints = new Set<string>();

  async send(subscription: PushSubscriptionInput, message: PushMessage) {
    if (this.goneEndpoints.has(subscription.endpoint)) {
      return { gone: true };
    }

    this.sent.push({ endpoint: subscription.endpoint, message });
    return { gone: false };
  }

  reset() {
    this.sent = [];
    this.goneEndpoints = new Set();
  }
}

export const fakePushSender = new FakePushSender();
