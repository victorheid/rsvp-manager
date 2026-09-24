import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { cancelEvent, confirmEvent } from "@/server/domains/events";
import { createRsvp } from "@/server/domains/rsvps";
import { completeTopUp } from "@/server/domains/wallet/actions/completeTopUp";
import { startTopUp } from "@/server/domains/wallet/actions/startTopUp";
import { createStripeGateway } from "@/server/integrations/stripe/real";
import { resetDatabase, FEE_SCHEDULE_V1_ID } from "@/server/testing/resetDatabase";

/**
 * The app's card flows end to end against Stripe's sandbox (opt-in, makes
 * real API calls: `pnpm test:stripe`): save a card at RSVP, charge it at
 * confirmation, refund on cancellation, wallet top-up. Uses the actions
 * directly with the real gateway, since feature tests always get the fake.
 */
const secretKey = process.env.STRIPE_SECRET_KEY;
const enabled = process.env.STRIPE_CONTRACT === "1" && secretKey?.startsWith("sk_test_") && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("app flows on the Stripe sandbox", () => {
  // Real network calls: several per test.
  vi.setConfig({ testTimeout: 60_000 });

  const stripe = new Stripe(secretKey ?? "sk_test_unused");
  const gateway = createStripeGateway(secretKey ?? "sk_test_unused");

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function setup() {
    const run = randomUUID().slice(0, 8);
    const organizer = await db.user.create({
      data: { phoneNumber: `+35383${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`, firstName: "Org", lastInitial: "O", email: `${run}@example.test`, emailVerifiedAt: new Date() },
    });
    const player = await db.user.create({
      data: { id: `p-${run}`, phoneNumber: `+35384${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`, firstName: "Ann", lastInitial: "B" },
    });
    const group = await db.group.create({ data: { slug: `g-${run}`, name: "G", organizerId: organizer.id } });
    const event = await db.event.create({
      data: {
        slug: `e-${run}`, groupId: group.id, feeScheduleId: FEE_SCHEDULE_V1_ID, title: "Sandbox game",
        startsAt: new Date(Date.now() + 86_400_000), endsAt: new Date(Date.now() + 90_000_000), location: "A",
        cutoffAt: new Date(Date.now() + 3_600_000), totalCostCents: 800, pricingMode: "FIXED_PER_HEAD", onlineAllowed: true,
      },
    });
    return { organizer, player, event, run };
  }

  it("saves a card, charges price + fee at confirmation, and refunds it all when the event is cancelled", async () => {
    const { organizer, player, event } = await setup();
    const { customerId } = await gateway.ensureCustomer({ userId: player.id, name: "Ann B" });
    await db.user.update({ where: { id: player.id }, data: { stripeCustomerId: customerId } });
    const { setupIntentId } = await gateway.createSetupIntent({ customerId });
    await stripe.setupIntents.confirm(setupIntentId, { payment_method: "pm_card_visa" });

    const rsvp = await createRsvp(db, gateway, { eventId: event.id, userId: player.id, paymentMethod: "CARD", setupIntentId }, new Date());
    expect(rsvp).toMatchObject({ paymentStatus: "PENDING", cardLast4: "4242" });

    await confirmEvent(db, gateway, { eventId: event.id, organizerId: organizer.id });

    const payment = await db.payment.findFirstOrThrow({ where: { rsvpId: rsvp.id } });
    expect(payment).toMatchObject({ status: "SUCCEEDED", amountCents: 800, feeCents: 50 });
    const charge = await stripe.charges.retrieve(payment.providerChargeId ?? "");
    expect(charge.amount).toBe(850);

    await cancelEvent(db, gateway, { eventId: event.id, organizerId: organizer.id });

    expect((await stripe.charges.retrieve(payment.providerChargeId ?? "")).amount_refunded).toBe(850);
    expect((await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).paymentStatus).toBe("REFUNDED");
  });

  it("marks a card that fails off-session as owing", async () => {
    const { organizer, player, event } = await setup();
    const { customerId } = await gateway.ensureCustomer({ userId: player.id, name: "Ann B" });
    await db.user.update({ where: { id: player.id }, data: { stripeCustomerId: customerId } });
    const { setupIntentId } = await gateway.createSetupIntent({ customerId });
    await stripe.setupIntents.confirm(setupIntentId, { payment_method: "pm_card_chargeCustomerFail" });

    const rsvp = await createRsvp(db, gateway, { eventId: event.id, userId: player.id, paymentMethod: "CARD", setupIntentId }, new Date());
    await confirmEvent(db, gateway, { eventId: event.id, organizerId: organizer.id });

    expect(await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).toMatchObject({ paymentStatus: "OWES" });
  });

  it("tops up a wallet: plan the charge, confirm it, credit the balance", async () => {
    const { player } = await setup();
    const started = await startTopUp(db, gateway, { userId: player.id, amountCents: 2000 }, new Date());
    expect(started.totalCents).toBe(2100);
    const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
    await stripe.paymentIntents.confirm(payment.providerIntentId ?? "", { payment_method: "pm_card_visa" });

    expect(await completeTopUp(db, gateway, { userId: player.id, paymentId: started.paymentId })).toEqual({ status: "succeeded", balanceCents: 2000 });
  });
});
