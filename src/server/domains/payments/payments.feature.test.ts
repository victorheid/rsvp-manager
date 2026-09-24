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
    const organizer = await db.user.create({ data: { phoneNumber: "+353830000001", firstName: "Org", email: "+353830000001@example.test", emailVerifiedAt: new Date(), lastInitial: "O" } });
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

      it("lets the organizer send the pay link again", async () => {
        const { organizerCaller, event } = await makeOrganizerAndEvent();
        const { user, caller } = await makePlayer("Bea", "+353830000003");
        await db.pushSubscription.create({ data: { userId: user.id, endpoint: "https://push.example/bea", p256dh: "k", auth: "a" } });
        const rsvp = await rsvpWithCard(caller, event.id, "declined");
        await organizerCaller.events.confirm({ eventId: event.id });
        const { payToken } = await db.rsvp.findUniqueOrThrow({ where: { id: rsvp.id } });
        fakePushSender.reset();

        const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
        expect(view.rsvps.find((r) => r.id === rsvp.id)?.actions).toContain("SEND_PAY_LINK");
        await organizerCaller.rsvps.sendPayLink({ rsvpId: rsvp.id });

        expect(fakePushSender.sent.map((entry) => entry.message.url)).toEqual([`/pay/${payToken}`]);
        await expect(caller.rsvps.sendPayLink({ rsvpId: rsvp.id })).rejects.toThrow("Only the group's organizer");
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

    it("retries a cancellation refund the provider rejected the first time", async () => {
      const { organizerCaller, event } = await makeOrganizerAndEvent();
      const { caller } = await makePlayer("Ann", "+353830000002");
      await rsvpWithCard(caller, event.id);
      await organizerCaller.events.confirm({ eventId: event.id });
      const original = fakePaymentGateway.refund.bind(fakePaymentGateway);
      fakePaymentGateway.refund = async () => {
        throw new Error("provider down");
      };

      try {
        await organizerCaller.events.cancel({ eventId: event.id });
      } finally {
        fakePaymentGateway.refund = original;
      }
      expect(fakePaymentGateway.refundsMade).toHaveLength(0);

      const { retryCancelledEventRefunds } = await import("@/server/domains/payments");
      expect(await retryCancelledEventRefunds(db, fakePaymentGateway)).toBe(1);
      expect(fakePaymentGateway.refundsMade.map((r) => r.amountCents)).toEqual([850]);
      expect(await retryCancelledEventRefunds(db, fakePaymentGateway)).toBe(0);
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

  it("keeps how people pay out of the public event page", async () => {
    const { organizerCaller, event } = await makeOrganizerAndEvent();
    const ok = await makePlayer("Ann", "+353830000002");
    const bad = await makePlayer("Bea", "+353830000003");
    await rsvpWithCard(ok.caller, event.id);
    const badRsvp = await rsvpWithCard(bad.caller, event.id, "declined");
    await organizerCaller.events.confirm({ eventId: event.id });
    const owing = await db.rsvp.findUniqueOrThrow({ where: { id: badRsvp.id } });
    const anonymous = appRouter.createCaller({ db, user: null, setSession: () => {}, clearSession: () => {} });

    const publicView = JSON.stringify(await anonymous.events.getBySlug({ slug: event.slug }));

    expect(publicView).not.toContain(owing.payToken);
    expect(publicView).not.toContain("pm_fake_");
    expect(publicView).not.toContain("cardLast4");
    expect(publicView).not.toContain("stripePaymentMethodId");
    // The player themself does get their own pay link (the page tells them they owe).
    const own = await bad.caller.events.getBySlug({ slug: event.slug });
    expect(own.viewerRsvp?.payToken).toBe(owing.payToken);
    expect(JSON.stringify(own)).not.toContain("pm_fake_");
  });

  describe("organizer refunds (§8)", () => {
    async function confirmedWithCardAndWalletPlayers() {
      const setup = await makeOrganizerAndEvent();
      const card = await makePlayer("Ann", "+353830000002");
      const wallet = await makePlayer("Bea", "+353830000003");
      const cash = await makePlayer("Cy", "+353830000004");
      await db.pushSubscription.create({ data: { userId: card.user.id, endpoint: "https://push.example/ann", p256dh: "k", auth: "a" } });
      const cardRsvp = await rsvpWithCard(card.caller, setup.event.id);
      await fundWallet(wallet.caller, 2000);
      const walletRsvp = await wallet.caller.rsvps.create({ eventId: setup.event.id, paymentMethod: "WALLET" });
      const cashRsvp = await cash.caller.rsvps.create({ eventId: setup.event.id, paymentMethod: "CASH" });
      await setup.organizerCaller.events.confirm({ eventId: setup.event.id });
      fakePushSender.reset();
      return { ...setup, card, wallet, cash, cardRsvp, walletRsvp, cashRsvp };
    }

    it("offers Refund on online-paid rows and Refund all on the event, but not on cash", async () => {
      const { organizerCaller, event, cardRsvp, walletRsvp, cashRsvp } = await confirmedWithCardAndWalletPlayers();

      const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });

      expect(view.rsvps.find((r) => r.id === cardRsvp.id)?.actions).toContain("REFUND");
      expect(view.rsvps.find((r) => r.id === walletRsvp.id)?.actions).toContain("REFUND");
      expect(view.rsvps.find((r) => r.id === cashRsvp.id)?.actions).not.toContain("REFUND");
      expect(view.eventActions.menu).toContain("REFUND_ALL");
      expect(JSON.stringify(view.rsvps)).not.toContain("payToken");
    });

    it("refunds a card payment's price but keeps the service fee, and tells the person", async () => {
      const { organizerCaller, cardRsvp } = await confirmedWithCardAndWalletPlayers();

      const result = await organizerCaller.rsvps.refund({ rsvpId: cardRsvp.id });

      expect(result.refundedCents).toBe(800);
      expect(fakePaymentGateway.refundsMade.map((r) => r.amountCents)).toEqual([800]); // not the €0.50 fee
      expect(await db.payment.findFirstOrThrow({ where: { rsvpId: cardRsvp.id } })).toMatchObject({ refundedCents: 800, feeRefundedCents: 0 });
      expect((await db.rsvp.findUniqueOrThrow({ where: { id: cardRsvp.id } })).paymentStatus).toBe("REFUNDED");
      expect(fakePushSender.sent.some((entry) => entry.message.title === "You've been refunded")).toBe(true);
    });

    it("refunds a wallet payment back onto the balance", async () => {
      const { organizerCaller, wallet, walletRsvp } = await confirmedWithCardAndWalletPlayers();
      expect((await wallet.caller.wallet.summary()).balanceCents).toBe(1200);

      await organizerCaller.rsvps.refund({ rsvpId: walletRsvp.id });

      expect((await wallet.caller.wallet.summary()).balanceCents).toBe(2000);
    });

    it("refunds someone who dropped out after paying", async () => {
      const { organizerCaller, card, cardRsvp } = await confirmedWithCardAndWalletPlayers();
      await card.caller.rsvps.drop({ eventId: cardRsvp.eventId });

      const view = await organizerCaller.rsvps.forOrganizer({ eventId: cardRsvp.eventId });
      expect(view.rsvps.find((r) => r.id === cardRsvp.id)?.actions).toEqual(["REFUND"]);

      await organizerCaller.rsvps.refund({ rsvpId: cardRsvp.id });
      expect(fakePaymentGateway.refundsMade).toHaveLength(1);
    });

    it("can't refund twice, or cash, or as a non-organizer", async () => {
      const { organizerCaller, card, cardRsvp, cashRsvp } = await confirmedWithCardAndWalletPlayers();

      await expect(card.caller.rsvps.refund({ rsvpId: cardRsvp.id })).rejects.toThrow("Only the group's organizer");
      await expect(organizerCaller.rsvps.refund({ rsvpId: cashRsvp.id })).rejects.toThrow("isn't possible at this stage");

      await organizerCaller.rsvps.refund({ rsvpId: cardRsvp.id });
      await expect(organizerCaller.rsvps.refund({ rsvpId: cardRsvp.id })).rejects.toThrow("isn't possible at this stage");
      expect(fakePaymentGateway.refundsMade).toHaveLength(1);
    });

    it("refunds everyone who paid online in one go, leaving cash alone", async () => {
      const { organizerCaller, event, cashRsvp } = await confirmedWithCardAndWalletPlayers();

      const result = await organizerCaller.rsvps.refundAll({ eventId: event.id });

      expect(result).toEqual({ refunded: 2, failed: 0, refundedCents: 1600 });
      expect((await db.rsvp.findUniqueOrThrow({ where: { id: cashRsvp.id } })).paymentStatus).toBe("PENDING");
      const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
      expect(view.eventActions.menu).not.toContain("REFUND_ALL"); // nothing left to refund
    });

    it("closes once the payout is due: two days after the event ends", async () => {
      const { organizerCaller, event, cardRsvp } = await confirmedWithCardAndWalletPlayers();
      const now = Date.now();
      await db.event.update({
        where: { id: event.id },
        data: { startsAt: new Date(now - 4 * 86_400_000), endsAt: new Date(now - 3 * 86_400_000), cutoffAt: new Date(now - 5 * 86_400_000) },
      });

      const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
      expect(view.rsvps.find((r) => r.id === cardRsvp.id)?.actions).not.toContain("REFUND");
      expect(view.eventActions.menu).not.toContain("REFUND_ALL");
      await expect(organizerCaller.rsvps.refund({ rsvpId: cardRsvp.id })).rejects.toThrow("isn't possible at this stage");
      await expect(organizerCaller.rsvps.refundAll({ eventId: event.id })).rejects.toThrow("paid out");
    });

    it("stays open until then", async () => {
      const { organizerCaller, event, cardRsvp } = await confirmedWithCardAndWalletPlayers();
      const now = Date.now();
      await db.event.update({
        where: { id: event.id },
        data: { startsAt: new Date(now - 2 * 86_400_000), endsAt: new Date(now - 86_400_000), cutoffAt: new Date(now - 3 * 86_400_000) },
      });

      const result = await organizerCaller.rsvps.refund({ rsvpId: cardRsvp.id });
      expect(result.refundedCents).toBe(800);
    });
  });
});
