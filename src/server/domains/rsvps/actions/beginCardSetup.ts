import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { getOrCreateCustomerId } from "@/server/domains/wallet";
import { isJoinableEventStatus } from "@/server/domains/rsvps/rules";
import type { PaymentGateway } from "@/server/integrations/stripe";

/**
 * First step of a card RSVP (§5): asks the provider for a SetupIntent, which
 * the browser confirms with the card details. Nothing is charged; the
 * saved card is then attached to the RSVP by `createRsvp`.
 */
export async function beginCardSetup(db: Db, gateway: PaymentGateway, input: { eventId: string; userId: string }) {
  const event = await db.event.findUnique({ where: { id: input.eventId } });

  if (!event || !isJoinableEventStatus(event.status)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This event isn't open for RSVPs." });
  }

  if (!event.onlineAllowed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This event doesn't accept online payments." });
  }

  const customerId = await getOrCreateCustomerId(db, gateway, input.userId);

  return gateway.createSetupIntent({ customerId });
}
