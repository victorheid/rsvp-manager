import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { fakePaymentGateway, type FakeCardScenario } from "@/server/integrations/stripe/fake";
import { fakePushSender } from "@/server/integrations/push/fake";
import { fakeSmsSender } from "@/server/integrations/sms/fake";
import { FEE_SCHEDULE_V1_ID, resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("online payments (wallet and card)", () => {
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
    fakePushSender.reset();
    fakeSmsSender.reset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  type Caller = ReturnType<typeof callerAs>;

  async function makeOrganizerAndEvent(overrides: { pricingMode?: PricingMode; totalCostCents?: number; minPlayers?: number } = {}) {
    const organizer = await db.user.create({ data: { phoneNumber: "+353830000001", firstName: "Org", lastInitial: "O" } });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    await caller.payouts.startOnboarding({ returnPath: "/" });
    await caller.payouts.refreshOnboarding();
    const group = await caller.groups.create({ name: "Futsal" });
    const startsAt = new Date(Date.now() + 86_400_000);
    const event = await caller.events.create({
      groupId: group.id,
      title: "Friday game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: overrides.totalCostCents ?? 800,
      pricingMode: overrides.pricingMode ?? PricingMode.FIXED_PER_HEAD,
      minPlayers: overrides.minPlayers,
      cashAllowed: true,
      onlineAllowed: true,
    });
    return { organizer, organizerCaller: caller, group, event };
  }

  async function makePlayer(name: string, phone: string) {
    const user = await db.user.create({ data: { phoneNumber: phone, firstName: name, lastInitial: "P" } });
    return { user, caller: callerAs(user.id, phone) };
  }

  async function fundWallet(caller: Caller, cents: number) {
    const started = await caller.wallet.startTopUp({ amountCents: cents });
    const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
    if (!payment.providerIntentId) throw new Error("no intent");
    fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
    await caller.wallet.completeTopUp({ paymentId: started.paymentId });
  }

  /** Plays the browser saving a card, then RSVPs with it. */
  async function rsvpWithCard(caller: Caller, eventId: string, scenario: FakeCardScenario = "visa") {
    const { setupIntentId } = await caller.rsvps.beginCardSetup({ eventId });
    fakePaymentGateway.completeSetupIntent(setupIntentId, scenario);
    return caller.rsvps.create({ eventId, paymentMethod: "CARD", setupIntentId });
  }

  describe("wallet RSVP", () => {
    it("holds the price at RSVP, and realizes it at confirmation", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { user, caller } = await makePlayer("Ann", "+353830000002");
      await fundWallet(caller, 2000);

      const rsvp = await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      expect(rsvp.paymentStatus).toBe("HELD");
      expect(await caller.wallet.summary()).toMatchObject({ balanceCents: 2000, heldCents: 800, availableCents: 1200 });

      await organizerCaller.events.confirm({ eventId: event.id });

      expect(await caller.wallet.summary()).toMatchObject({ balanceCents: 1200, heldCents: 0 });
      expect((await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).paymentStatus).toBe("CHARGED");
      const payment = await db.payment.findFirstOrThrow({ where: { userId: user.id, kind: "GAME_WALLET" } });
      expect(payment).toMatchObject({ amountCents: 800, feeCents: 0, status: "SUCCEEDED" }); // no service fee on wallet
      expect(fakePaymentGateway.chargesMade).toHaveLength(1); // only the top-up hit the card
    });

    it("holds the upper bound for split pricing and releases the difference at confirmation", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent({ pricingMode: PricingMode.SPLIT_EVENLY, totalCostCents: 1200, minPlayers: 2 });
      const a = await makePlayer("Ann", "+353830000002");
      const b = await makePlayer("Bea", "+353830000003");
      await fundWallet(a.caller, 2000);
      await fundWallet(b.caller, 2000);

      const c = await makePlayer("Cy", "+353830000004");
      await fundWallet(c.caller, 2000);

      await a.caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      expect((await a.caller.wallet.summary()).heldCents).toBe(600); // €12 ÷ min 2: the most it could cost
      await b.caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      await c.caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      await organizerCaller.events.confirm({ eventId: event.id });

      // Three players split €12: €4 each. The €2 above that in each hold is released.
      expect(await a.caller.wallet.summary()).toMatchObject({ balanceCents: 1600, heldCents: 0, availableCents: 1600 });
    });

    it("releases the hold when the player drops out before confirmation", async () => {
      const { event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await fundWallet(caller, 2000);
      await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });

      await caller.rsvps.drop({ eventId: event.id });

      expect(await caller.wallet.summary()).toMatchObject({ balanceCents: 2000, heldCents: 0, availableCents: 2000 });
    });

    it("lets someone rejoin after dropping out, with a fresh hold", async () => {
      const { event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await fundWallet(caller, 2000);
      await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      await caller.rsvps.drop({ eventId: event.id });

      await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });

      expect((await caller.wallet.summary()).heldCents).toBe(800);
    });

    it("refuses the RSVP when the wallet can't cover the hold", async () => {
      const { event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");

      await expect(caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" })).rejects.toThrow(
        "Not enough in your wallet",
      );
      expect(await db.rsvp.count()).toBe(0); // the RSVP rolled back with the failed hold
    });

    it("debits at the locked price when joining an already-confirmed event", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const first = await makePlayer("Ann", "+353830000002");
      await first.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
      await organizerCaller.events.confirm({ eventId: event.id });
      const late = await makePlayer("Cy", "+353830000004");
      await fundWallet(late.caller, 2000);

      const rsvp = await late.caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });

      expect(rsvp.paymentStatus).toBe("CHARGED");
      expect((await late.caller.wallet.summary()).balanceCents).toBe(1200);
    });

    it("keeps the money after a post-confirmation drop-out — refunds are the organizer's call", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await fundWallet(caller, 2000);
      await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      await organizerCaller.events.confirm({ eventId: event.id });

      await caller.rsvps.drop({ eventId: event.id });

      expect((await caller.wallet.summary()).balanceCents).toBe(1200);
    });

    it("releases holds when the event expires, and when it's cancelled", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await fundWallet(caller, 2000);
      await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });

      await organizerCaller.events.cancel({ eventId: event.id });

      expect(await caller.wallet.summary()).toMatchObject({ balanceCents: 2000, heldCents: 0 });
    });

    it("refunds wallet payments back onto the balance when a confirmed event is cancelled", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await fundWallet(caller, 2000);
      await caller.rsvps.create({ eventId: event.id, paymentMethod: "WALLET" });
      await organizerCaller.events.confirm({ eventId: event.id });

      await organizerCaller.events.cancel({ eventId: event.id });

      expect((await caller.wallet.summary()).balanceCents).toBe(2000);
      expect(await db.walletEntry.findMany({ where: { kind: "REFUND" } })).toMatchObject([{ amountCents: 800 }]);
    });
  });

  describe("card RSVP", () => {
    it("saves the card at RSVP, charges price + fee at confirmation, and stores the fee", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { user, caller } = await makePlayer("Ann", "+353830000002");

      const rsvp = await rsvpWithCard(caller, event.id);
      expect(rsvp).toMatchObject({ paymentMethod: "CARD", paymentStatus: "PENDING", cardLast4: "4242" });
      expect(fakePaymentGateway.chargesMade).toHaveLength(0); // nobody is charged just for RSVPing

      await organizerCaller.events.confirm({ eventId: event.id });

      expect(fakePaymentGateway.chargesMade.map((c) => c.amountCents)).toEqual([850]); // €8.00 + €0.50
      expect((await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).paymentStatus).toBe("CHARGED");
      expect(await db.payment.findFirstOrThrow({ where: { userId: user.id, kind: "GAME_CARD" } })).toMatchObject({
        status: "SUCCEEDED",
        amountCents: 800,
        feeCents: 50,
        feeScheduleId: FEE_SCHEDULE_V1_ID,
      });
    });

    it("charges once even if confirmation runs its charging step twice", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      const rsvp = await rsvpWithCard(caller, event.id);
      await organizerCaller.events.confirm({ eventId: event.id });

      const { chargeCardRsvp } = await import("@/server/domains/payments");
      expect(await chargeCardRsvp(db, fakePaymentGateway, { rsvpId: rsvp.id })).toBe("skipped");

      expect(fakePaymentGateway.chargesMade).toHaveLength(1);
    });

    it("charges immediately when joining an already-confirmed event, at the locked price", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent({ pricingMode: PricingMode.SPLIT_EVENLY, totalCostCents: 1000 });
      const first = await makePlayer("Ann", "+353830000002");
      await first.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
      await organizerCaller.events.confirm({ eventId: event.id }); // locks €10.00 for one player
      const late = await makePlayer("Cy", "+353830000004");

      const rsvp = await rsvpWithCard(late.caller, event.id);

      expect(rsvp.paymentStatus).toBe("CHARGED");
      expect(fakePaymentGateway.chargesMade.map((c) => c.amountCents)).toEqual([1050]);
    });

    describe("when the charge fails", () => {
      it.each(["declined", "expired", "insufficient_funds", "requires_action"] as const)(
        "marks a %s card as owing, with a pay link, and tells the person",
        async (scenario) => {
          const { organizerCaller, event } = await makeOrganizerAndEvent();
          const ok = await makePlayer("Ann", "+353830000002");
          const bad = await makePlayer("Bea", "+353830000003");
          await db.pushSubscription.create({ data: { userId: bad.user.id, endpoint: "https://push.example/bea", p256dh: "k", auth: "a" } });
          await rsvpWithCard(ok.caller, event.id);
          const badRsvp = await rsvpWithCard(bad.caller, event.id, scenario);

          const confirmed = await organizerCaller.events.confirm({ eventId: event.id });

          expect(confirmed.event.status).toBe("CONFIRMED"); // one failure doesn't undo the confirmation
          const owing = await db.rsvp.findUniqueOrThrow({ where: { id: badRsvp.id } });
          expect(owing.paymentStatus).toBe("OWES");
          expect(owing.payToken).toBeTruthy();
          expect((await db.payment.findFirstOrThrow({ where: { rsvpId: badRsvp.id } })).status).toBe("FAILED");
          expect(await db.rsvp.count({ where: { paymentStatus: "CHARGED" } })).toBe(1);

          const sent = fakePushSender.sent.find((entry) => entry.message.title === "Your payment didn't go through");
          expect(sent?.message.url).toBe(`/pay/${owing.payToken}`);
          expect(
            fakeSmsSender.sentMessages.some((sms) => sms.to === "+353830000003" && sms.body.includes("didn't go through")),
          ).toBe(true);
        },
      );

      it("lets the person pay via the link, at the original price and fee", async () => {
        const { organizerCaller, event } = await makeOrganizerAndEvent();
        const { caller } = await makePlayer("Bea", "+353830000003");
        const rsvp = await rsvpWithCard(caller, event.id, "declined");
        await organizerCaller.events.confirm({ eventId: event.id });
        const { payToken } = await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
        if (!payToken) throw new Error("no pay token");

        expect(await caller.payments.owed({ token: payToken })).toMatchObject({ priceCents: 800, feeCents: 50, totalCents: 850 });

        const { clientSecret } = await caller.payments.startOwedPayment({ token: payToken });
        expect(await caller.payments.completeOwedPayment({ token: payToken })).toEqual({ status: "pending" });

        const payment = await db.payment.findFirstOrThrow({ where: { rsvpId: rsvp.id } });
        if (!payment.providerIntentId) throw new Error("no intent");
        expect(clientSecret).toContain(payment.providerIntentId);
        fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
        expect(await caller.payments.completeOwedPayment({ token: payToken })).toEqual({ status: "paid" });
        expect(await caller.payments.completeOwedPayment({ token: payToken })).toEqual({ status: "paid" }); // idempotent

        expect(await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).toMatchObject({ paymentStatus: "CHARGED" });
        expect(await db.payment.findFirstOrThrow({ where: { rsvpId: rsvp.id } })).toMatchObject({ status: "SUCCEEDED", amountCents: 800, feeCents: 50 });
        await expect(caller.payments.owed({ token: payToken })).rejects.toThrow("nothing left to pay");
      });

      it("keeps them owing when the retry is declined too", async () => {
        const { organizerCaller, event } = await makeOrganizerAndEvent();
        const { caller } = await makePlayer("Bea", "+353830000003");
        const rsvp = await rsvpWithCard(caller, event.id, "declined");
        await organizerCaller.events.confirm({ eventId: event.id });
        const { payToken } = await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
        if (!payToken) throw new Error("no pay token");

        await caller.payments.startOwedPayment({ token: payToken });
        const payment = await db.payment.findFirstOrThrow({ where: { rsvpId: rsvp.id } });
        if (!payment.providerIntentId) throw new Error("no intent");
        fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "declined");

        expect(await caller.payments.completeOwedPayment({ token: payToken })).toEqual({ status: "failed" });
        expect((await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).paymentStatus).toBe("OWES");
      });

      it("only lets the owner use a pay link", async () => {
        const { organizerCaller, event } = await makeOrganizerAndEvent();
        const owner = await makePlayer("Bea", "+353830000003");
        const stranger = await makePlayer("Cy", "+353830000004");
        const rsvp = await rsvpWithCard(owner.caller, event.id, "declined");
        await organizerCaller.events.confirm({ eventId: event.id });
        const { payToken } = await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
        if (!payToken) throw new Error("no pay token");

        await expect(stranger.caller.payments.owed({ token: payToken })).rejects.toThrow("NOT_FOUND");
        await expect(stranger.caller.payments.startOwedPayment({ token: payToken })).rejects.toThrow("NOT_FOUND");
      });
    });

    it("never charges saved cards when the event is cancelled or expires unconfirmed", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await rsvpWithCard(caller, event.id);

      await organizerCaller.events.cancel({ eventId: event.id });

      expect(fakePaymentGateway.chargesMade).toHaveLength(0);
      expect(fakePaymentGateway.refundsMade).toHaveLength(0);
    });

    it("refunds card payments in full, fee included, when a confirmed event is cancelled", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { user, caller } = await makePlayer("Ann", "+353830000002");
      const rsvp = await rsvpWithCard(caller, event.id);
      await organizerCaller.events.confirm({ eventId: event.id });

      await organizerCaller.events.cancel({ eventId: event.id });

      expect(fakePaymentGateway.refundsMade.map((r) => r.amountCents)).toEqual([850]);
      expect(await db.payment.findFirstOrThrow({ where: { userId: user.id, kind: "GAME_CARD" } })).toMatchObject({
        refundedCents: 800,
        feeRefundedCents: 50,
      });
      expect((await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } })).paymentStatus).toBe("REFUNDED");
    });

    it("refunds someone who dropped out after paying when the event is cancelled", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await rsvpWithCard(caller, event.id);
      await organizerCaller.events.confirm({ eventId: event.id });
      await caller.rsvps.drop({ eventId: event.id });
      expect(fakePaymentGateway.refundsMade).toHaveLength(0); // no auto-refund on drop-out

      await organizerCaller.events.cancel({ eventId: event.id });

      expect(fakePaymentGateway.refundsMade.map((r) => r.amountCents)).toEqual([850]);
    });

    it("needs a saved card: an unconfirmed SetupIntent is refused", async () => {
      const { event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      const { setupIntentId } = await caller.rsvps.beginCardSetup({ eventId: event.id });

      await expect(caller.rsvps.create({ eventId: event.id, paymentMethod: "CARD", setupIntentId })).rejects.toThrow("card wasn't saved");
      await expect(caller.rsvps.create({ eventId: event.id, paymentMethod: "CARD" })).rejects.toThrow("card wasn't saved");
    });

    it("refuses card setup on a cash-only event", async () => {
      const { organizerCaller, group } = await makeOrganizerAndEvent();
      const startsAt = new Date(Date.now() + 86_400_000);
      const cashOnly = await organizerCaller.events.create({
        groupId: group.id, title: "Cash", startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000),
        location: "A", cutoffAt: new Date(Date.now() + 3_600_000), totalCostCents: 500,
        pricingMode: PricingMode.FIXED_PER_HEAD, cashAllowed: true,
      });
      const { caller } = await makePlayer("Ann", "+353830000002");

      await expect(caller.rsvps.beginCardSetup({ eventId: cashOnly.id })).rejects.toThrow("doesn't accept online payments");
    });
  });
});
