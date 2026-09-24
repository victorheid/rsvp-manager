import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { POST } from "@/app/api/stripe/webhook/route";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { fakePaymentGateway } from "@/server/integrations/stripe/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("provider webhooks (§5)", () => {
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

  /** Posts a webhook the way the provider would. */
  function post(event: object, signature: string | null = "fake-signature") {
    return POST(
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: JSON.stringify(event),
        headers: signature ? { "stripe-signature": signature } : {},
      }),
    );
  }

  async function makePlayer(phone = "+353830000002") {
    const user = await db.user.create({ data: { phoneNumber: phone, firstName: "Ann", lastInitial: "B" } });
    return { user, caller: callerAs(user.id, phone) };
  }

  /** Starts a top-up and has the (pretend) browser pay it, but never tells our server — the tab closed. */
  async function paidTopUpNobodyToldUsAbout(caller: ReturnType<typeof callerAs>) {
    const started = await caller.wallet.startTopUp({ amountCents: 2000 });
    const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
    if (!payment.providerIntentId) throw new Error("no intent");
    fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
    return { started, intentId: payment.providerIntentId };
  }

  it("credits a top-up when the player closed the tab after paying, exactly once", async () => {
    const { caller } = await makePlayer();
    const { started, intentId } = await paidTopUpNobodyToldUsAbout(caller);
    expect((await caller.wallet.summary()).balanceCents).toBe(0);

    expect((await post({ type: "payment_updated", paymentIntentId: intentId })).status).toBe(200);
    expect((await caller.wallet.summary()).balanceCents).toBe(2000);

    // The provider retries, and the player's browser comes back later: still credited once.
    await post({ type: "payment_updated", paymentIntentId: intentId });
    await caller.wallet.completeTopUp({ paymentId: started.paymentId });
    expect((await caller.wallet.summary()).balanceCents).toBe(2000);
    expect(await db.walletEntry.count()).toBe(1);
  });

  it("records a pay-link payment when the browser never came back", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353830000001", firstName: "Org", lastInitial: "O", email: "org@example.test", emailVerifiedAt: new Date() },
    });
    const organizerCaller = callerAs(organizer.id, organizer.phoneNumber);
    await organizerCaller.payouts.startOnboarding({ returnPath: "/" });
    await organizerCaller.payouts.refreshOnboarding();
    const group = await organizerCaller.groups.create({ name: "Futsal" });
    const startsAt = new Date(Date.now() + 86_400_000);
    const event = await organizerCaller.events.create({
      groupId: group.id, title: "Game", startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), location: "A",
      cutoffAt: new Date(Date.now() + 3_600_000), totalCostCents: 800, pricingMode: PricingMode.FIXED_PER_HEAD, onlineAllowed: true,
    });
    const { caller } = await makePlayer();
    const { setupIntentId } = await caller.rsvps.beginCardSetup({ eventId: event.id });
    fakePaymentGateway.completeSetupIntent(setupIntentId, "declined");
    const rsvp = await caller.rsvps.create({ eventId: event.id, paymentMethod: "CARD", setupIntentId });
    await organizerCaller.events.confirm({ eventId: event.id });
    const { payToken } = await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
    if (!payToken) throw new Error("no pay token");
    await caller.payments.startOwedPayment({ token: payToken });
    const payment = await db.payment.findFirstOrThrow({ where: { rsvpId: rsvp.id } });
    if (!payment.providerIntentId) throw new Error("no intent");
    fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");

    await post({ type: "payment_updated", paymentIntentId: payment.providerIntentId });

    expect(await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).toMatchObject({ paymentStatus: "CHARGED" });
    expect(await db.payment.findFirstOrThrow({ where: { rsvpId: rsvp.id } })).toMatchObject({ status: "SUCCEEDED" });
  });

  it("refreshes an organizer's payout status when their account changes", async () => {
    fakePaymentGateway.onboardingCompletesImmediately = false;
    const organizer = await db.user.create({
      data: { phoneNumber: "+353830000001", firstName: "Org", lastInitial: "O", email: "org@example.test", emailVerifiedAt: new Date() },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    await caller.payouts.startOnboarding({ returnPath: "/" });
    expect(await caller.payouts.refreshOnboarding()).toEqual({ payoutsEnabled: false });
    const accountId = `acct_fake_${organizer.id}`;
    fakePaymentGateway.completeOnboarding(accountId);

    await post({ type: "account_updated", accountId });

    expect((await db.user.findUniqueOrThrow({ where: { id: organizer.id } })).payoutsEnabled).toBe(true);
  });

  it("refuses an unsigned or wrongly signed request and changes nothing", async () => {
    const { caller } = await makePlayer();
    const { intentId } = await paidTopUpNobodyToldUsAbout(caller);

    expect((await post({ type: "payment_updated", paymentIntentId: intentId }, null)).status).toBe(400);
    expect((await post({ type: "payment_updated", paymentIntentId: intentId }, "forged")).status).toBe(400);

    expect((await caller.wallet.summary()).balanceCents).toBe(0);
  });

  it("acknowledges events that aren't ours or that we don't act on", async () => {
    expect((await post({ type: "payment_updated", paymentIntentId: "pi_someone_elses" })).status).toBe(200);
    expect((await post({ type: "account_updated", accountId: "acct_unknown" })).status).toBe(200);
    expect((await post({ type: "customer.created" })).status).toBe(200);
  });

  it("answers 500 when handling fails, so the provider retries", async () => {
    const { caller } = await makePlayer();
    const { intentId } = await paidTopUpNobodyToldUsAbout(caller);
    const original = fakePaymentGateway.retrievePaymentIntent.bind(fakePaymentGateway);
    fakePaymentGateway.retrievePaymentIntent = async () => {
      throw new Error("provider down");
    };

    try {
      expect((await post({ type: "payment_updated", paymentIntentId: intentId })).status).toBe(500);
    } finally {
      fakePaymentGateway.retrievePaymentIntent = original;
    }

    expect((await post({ type: "payment_updated", paymentIntentId: intentId })).status).toBe(200);
    expect((await caller.wallet.summary()).balanceCents).toBe(2000);
  });
});
