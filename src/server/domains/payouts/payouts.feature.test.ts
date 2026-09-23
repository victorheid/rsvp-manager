import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { fakePaymentGateway } from "@/server/integrations/stripe/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";
import { releaseDuePayouts } from "@/server/domains/payouts";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("payout release (§5)", () => {
  function callerAs(userId: string, phoneNumber: string) {
    return appRouter.createCaller({
      db,
      user: { id: userId, phoneNumber },
      setSession: () => {},
      clearSession: () => {},
    });
  }

  beforeEach(async () => {
    await resetDatabase();
    fakePaymentGateway.reset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const DAY = 86_400_000;

  async function makePlayer(name: string, phone: string) {
    const user = await db.user.create({ data: { phoneNumber: phone, firstName: name, lastInitial: "P" } });
    return { user, caller: callerAs(user.id, phone) };
  }

  async function confirmedEventWithPayments(options: { onboard?: boolean } = {}) {
    const organizer = await db.user.create({ data: { phoneNumber: "+353830000001", firstName: "Org", email: "+353830000001@example.test", emailVerifiedAt: new Date(), lastInitial: "O" } });
    const organizerCaller = callerAs(organizer.id, organizer.phoneNumber);
    if (options.onboard !== false) {
      await organizerCaller.payouts.startOnboarding({ returnPath: "/" });
      await organizerCaller.payouts.refreshOnboarding();
    }
    const group = await organizerCaller.groups.create({ name: "Futsal" });
    const startsAt = new Date(Date.now() + DAY);
    // Not onboarded → cash only.
    const event = await organizerCaller.events.create({
      groupId: group.id, title: "Game", startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), location: "A",
      cutoffAt: new Date(Date.now() + 3_600_000), totalCostCents: 800, pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true, onlineAllowed: options.onboard !== false,
    });

    const card = await makePlayer("Ann", "+353830000002");
    const wallet = await makePlayer("Bea", "+353830000003");
    const cash = await makePlayer("Cy", "+353830000004");
    if (options.onboard !== false) {
      const { setupIntentId } = await card.caller.rsvps.beginCardSetup({ eventId: event.id });
      fakePaymentGateway.completeSetupIntent(setupIntentId, "visa");
      await card.caller.rsvps.create({ eventId: event.id, paymentMethod: "CARD", setupIntentId });

      const topUp = await wallet.caller.wallet.startTopUp({ amountCents: 2000 });
      const payment = await db.payment.findUniqueOrThrow({ where: { id: topUp.paymentId } });
      if (!payment.providerIntentId) throw new Error("no intent");
      fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
      await wallet.caller.wallet.completeTopUp({ paymentId: topUp.paymentId });
      await wallet.caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
    }
    await cash.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await organizerCaller.events.confirm({ eventId: event.id });

    return { organizer, organizerCaller, group, event, card, wallet, cash };
  }

  /** Moves the game into the past so it ended `daysAgo` days ago. */
  async function endedDaysAgo(eventId: string, daysAgo: number) {
    const endsAt = new Date(Date.now() - daysAgo * DAY);
    await db.event.update({
      where: { id: eventId },
      data: { startsAt: new Date(endsAt.getTime() - 3_600_000), endsAt, cutoffAt: new Date(endsAt.getTime() - DAY) },
    });
  }

  it("pays the organizer the full price of every online payment, two days after the event", async () => {
    const { organizer, event } = await confirmedEventWithPayments();
    await endedDaysAgo(event.id, 2.01);

    const released = await releaseDuePayouts(db, fakePaymentGateway, new Date());

    expect(released.map((r) => r.amountCents)).toEqual([1600]); // card €8 + wallet €8; not the €0.50 fee, not cash
    expect(fakePaymentGateway.payoutsMade).toMatchObject([{ accountId: `acct_fake_${organizer.id}`, amountCents: 1600 }]);
    expect(await db.payout.findUniqueOrThrow({ where: { eventId: event.id } })).toMatchObject({ amountCents: 1600, organizerId: organizer.id });
  });

  it("pays each event once", async () => {
    const { event } = await confirmedEventWithPayments();
    await endedDaysAgo(event.id, 3);

    await releaseDuePayouts(db, fakePaymentGateway, new Date());
    const again = await releaseDuePayouts(db, fakePaymentGateway, new Date());

    expect(again).toEqual([]);
    expect(fakePaymentGateway.payoutsMade).toHaveLength(1);
  });

  it("waits until two days after the event ends", async () => {
    const { event } = await confirmedEventWithPayments();
    await endedDaysAgo(event.id, 1.9);

    expect(await releaseDuePayouts(db, fakePaymentGateway, new Date())).toEqual([]);
    expect(await db.payout.count()).toBe(0);
  });

  it("leaves out refunded prices", async () => {
    const { organizerCaller, event, card } = await confirmedEventWithPayments();
    const rsvp = await db.rsvp.findFirstOrThrow({ where: { eventId: event.id, userId: card.user.id } });
    await organizerCaller.rsvps.refund({ rsvpId: rsvp.id });
    await endedDaysAgo(event.id, 3);

    const released = await releaseDuePayouts(db, fakePaymentGateway, new Date());

    expect(released.map((r) => r.amountCents)).toEqual([800]);
  });

  it("doesn't pay for cancelled or unconfirmed events", async () => {
    const { organizerCaller, event } = await confirmedEventWithPayments();
    await organizerCaller.events.cancel({ eventId: event.id });
    await endedDaysAgo(event.id, 3);

    expect(await releaseDuePayouts(db, fakePaymentGateway, new Date())).toEqual([]);
    expect(fakePaymentGateway.payoutsMade).toEqual([]);
  });

  it("records a cash-only event with nothing to pay out, without a transfer", async () => {
    const { event } = await confirmedEventWithPayments({ onboard: false });
    await endedDaysAgo(event.id, 3);

    const released = await releaseDuePayouts(db, fakePaymentGateway, new Date());

    expect(released.map((r) => r.amountCents)).toEqual([0]);
    expect(fakePaymentGateway.payoutsMade).toEqual([]);
    expect(await db.payout.findUniqueOrThrow({ where: { eventId: event.id } })).toMatchObject({ providerTransferId: null });
  });

  it("holds the payout until the organizer has finished onboarding", async () => {
    const { organizer, event } = await confirmedEventWithPayments();
    await endedDaysAgo(event.id, 3);
    // Provider reports the account as not (or no longer) enabled.
    fakePaymentGateway.onboardingCompletesImmediately = false;
    fakePaymentGateway.reset();
    fakePaymentGateway.onboardingCompletesImmediately = false;
    await db.user.update({ where: { id: organizer.id }, data: { payoutsEnabled: false } });

    expect(await releaseDuePayouts(db, fakePaymentGateway, new Date())).toEqual([]);
    expect(await db.payout.count()).toBe(0);

    fakePaymentGateway.completeOnboarding(`acct_fake_${organizer.id}`);
    expect(await releaseDuePayouts(db, fakePaymentGateway, new Date())).toHaveLength(1);
  });
});
