import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { fakePaymentGateway } from "@/server/integrations/stripe/fake";
import { FEE_SCHEDULE_V1_ID, resetDatabase } from "@/server/testing/resetDatabase";
import { chargeWalletNow, getWalletSummary, placeHold, realizeHold, releaseHold } from "@/server/domains/wallet";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("wallet", () => {
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

  async function makeUser(phoneNumber = "+353830000001") {
    const user = await db.user.create({ data: { phoneNumber, name: "Ann" } });
    return { user, caller: callerAs(user.id, phoneNumber) };
  }

  /** Top-ups the wallet by `amountCents` end to end, playing the browser's part. */
  async function topUp(caller: ReturnType<typeof callerAs>, amountCents: number) {
    const started = await caller.wallet.startTopUp({ amountCents });
    const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
    if (!payment.providerIntentId) throw new Error("no intent");
    fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
    return caller.wallet.completeTopUp({ paymentId: started.paymentId });
  }

  describe("top-up", () => {
    it("charges the amount plus the stepped fee, then credits the amount", async () => {
      const { caller } = await makeUser();

      const started = await caller.wallet.startTopUp({ amountCents: 5000 });
      expect(started).toMatchObject({ creditCents: 5000, feeCents: 150, totalCents: 5150 });
      expect((await caller.wallet.summary()).balanceCents).toBe(0); // nothing credited yet

      const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
      expect(payment).toMatchObject({ kind: "TOP_UP", status: "PENDING", amountCents: 5000, feeCents: 150, feeScheduleId: FEE_SCHEDULE_V1_ID });

      if (!payment.providerIntentId) throw new Error("no intent");
      fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
      const done = await caller.wallet.completeTopUp({ paymentId: started.paymentId });

      expect(done).toEqual({ status: "succeeded", balanceCents: 5000 });
      expect(fakePaymentGateway.chargesMade.map((c) => c.amountCents)).toEqual([5150]);
      expect(await db.walletEntry.findMany()).toMatchObject([{ kind: "TOP_UP", amountCents: 5000 }]);
    });

    it("stays pending until the browser confirms, and credits only once however often it's completed", async () => {
      const { caller } = await makeUser();
      const started = await caller.wallet.startTopUp({ amountCents: 2000 });

      expect(await caller.wallet.completeTopUp({ paymentId: started.paymentId })).toEqual({ status: "pending" });

      const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
      if (!payment.providerIntentId) throw new Error("no intent");
      fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
      await caller.wallet.completeTopUp({ paymentId: started.paymentId });
      await caller.wallet.completeTopUp({ paymentId: started.paymentId });

      expect((await caller.wallet.summary()).balanceCents).toBe(2000);
      expect(await db.walletEntry.count()).toBe(1);
    });

    it("credits nothing when the card is declined", async () => {
      const { caller } = await makeUser();
      const started = await caller.wallet.startTopUp({ amountCents: 2000 });
      const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
      if (!payment.providerIntentId) throw new Error("no intent");
      fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "declined");

      expect(await caller.wallet.completeTopUp({ paymentId: started.paymentId })).toEqual({ status: "failed" });

      expect((await caller.wallet.summary()).balanceCents).toBe(0);
      expect((await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } })).status).toBe("FAILED");
    });

    it("refuses amounts that aren't offered, and top-ups over the €150 max", async () => {
      const { caller } = await makeUser();

      await expect(caller.wallet.startTopUp({ amountCents: 3000 })).rejects.toThrow("Choose €20, €50 or €100");

      await topUp(caller, 10_000);
      await topUp(caller, 5000);
      await expect(caller.wallet.startTopUp({ amountCents: 2000 })).rejects.toThrow("€150 max");
      expect((await caller.wallet.summary()).topUpOptions).toEqual([]);
    });

    it("refunds in full, fee included, if a racing top-up would have passed the cap", async () => {
      const { caller } = await makeUser();
      // Two top-ups started while the balance was empty, so both were allowed.
      const first = await caller.wallet.startTopUp({ amountCents: 10_000 });
      const second = await caller.wallet.startTopUp({ amountCents: 10_000 });
      for (const started of [first, second]) {
        const payment = await db.payment.findUniqueOrThrow({ where: { id: started.paymentId } });
        if (!payment.providerIntentId) throw new Error("no intent");
        fakePaymentGateway.completePaymentIntent(payment.providerIntentId, "visa");
      }

      expect((await caller.wallet.completeTopUp({ paymentId: first.paymentId })).status).toBe("succeeded");
      expect(await caller.wallet.completeTopUp({ paymentId: second.paymentId })).toEqual({ status: "refunded" });

      expect((await caller.wallet.summary()).balanceCents).toBe(10_000);
      expect(fakePaymentGateway.refundsMade.map((r) => r.amountCents)).toEqual([10_250]);
    });

    it("can't complete someone else's top-up", async () => {
      const owner = await makeUser("+353830000001");
      const other = await makeUser("+353830000002");
      const started = await owner.caller.wallet.startTopUp({ amountCents: 2000 });

      await expect(other.caller.wallet.completeTopUp({ paymentId: started.paymentId })).rejects.toThrow("NOT_FOUND");
    });

    it("uses the fee schedule in force at the time of the top-up", async () => {
      const { caller } = await makeUser();
      await db.feeSchedule.create({
        data: {
          version: 2,
          effectiveFrom: new Date(Date.now() - 1000),
          gameCardFeeTiers: [{ upToCents: null, feeCents: 50 }],
          topUpFeeTiers: [{ upToCents: 10_000, feeCents: 400 }],
        },
      });

      expect(await caller.wallet.startTopUp({ amountCents: 2000 })).toMatchObject({ feeCents: 400, totalCents: 2400 });
    });
  });

  it("offers the top-up amounts with their fees", async () => {
    const { caller } = await makeUser();

    expect((await caller.wallet.summary()).topUpOptions).toEqual([
      { amountCents: 2000, feeCents: 100, totalCents: 2100 },
      { amountCents: 5000, feeCents: 150, totalCents: 5150 },
      { amountCents: 10_000, feeCents: 250, totalCents: 10_250 },
    ]);
  });

  it("refuses top-ups and wallet RSVPs while the wallet is switched off", async () => {
    const { caller } = await makeUser();
    const previous = process.env.WALLET_ENABLED;
    process.env.WALLET_ENABLED = "false";

    try {
      expect((await caller.wallet.summary()).enabled).toBe(false);
      await expect(caller.wallet.startTopUp({ amountCents: 2000 })).rejects.toThrow("isn't available yet");
    } finally {
      if (previous === undefined) delete process.env.WALLET_ENABLED;
      else process.env.WALLET_ENABLED = previous;
    }
  });

  describe("holds", () => {
    async function fundedWallet(cents: number) {
      const { user, caller } = await makeUser();
      await topUp(caller, cents);
      return { user, caller };
    }

    /** Holds and charges belong to an RSVP; these tests only need an id, so they use a real one. */
    async function makeRsvp(userId: string, n: number) {
      const organizer = await db.user.upsert({
        where: { phoneNumber: "+353830009999" },
        create: { phoneNumber: "+353830009999", name: "Org", email: "+353830009999@example.test", emailVerifiedAt: new Date() },
        update: {},
      });
      const group = await db.group.upsert({
        where: { slug: "g" },
        create: { slug: "g", name: "G", organizerId: organizer.id },
        update: {},
      });
      const event = await db.event.create({
        data: {
          slug: `e${n}`, groupId: group.id, feeScheduleId: FEE_SCHEDULE_V1_ID, title: "E", startsAt: new Date(Date.now() + 86_400_000),
          endsAt: new Date(Date.now() + 90_000_000), location: "A", cutoffAt: new Date(Date.now() + 3_600_000),
          totalCostCents: 800, pricingMode: "FIXED_PER_HEAD",
        },
      });
      return db.rsvp.create({ data: { eventId: event.id, userId, paymentMethod: "WALLET" } });
    }

    it("reduces the available balance without moving money", async () => {
      const { user } = await fundedWallet(2000);
      const rsvp = await makeRsvp(user.id, 1);

      await db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: rsvp.id, amountCents: 800 }));

      expect(await getWalletSummary(db, user.id, new Date())).toMatchObject({ balanceCents: 2000, heldCents: 800, availableCents: 1200 });
    });

    it("refuses a hold the available balance can't cover, counting other holds", async () => {
      const { user } = await fundedWallet(2000);
      const first = await makeRsvp(user.id, 1);
      const second = await makeRsvp(user.id, 2);
      await db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: first.id, amountCents: 1500 }));

      await expect(
        db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: second.id, amountCents: 600 })),
      ).rejects.toThrow("Not enough in your wallet");
    });

    it("realizes a hold at the locked price and releases the difference (split pricing)", async () => {
      const { user } = await fundedWallet(2000);
      const rsvp = await makeRsvp(user.id, 1);
      await db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: rsvp.id, amountCents: 1000 })); // upper bound

      const payment = await db.$transaction((tx) =>
        realizeHold(tx, { userId: user.id, rsvpId: rsvp.id, priceCents: 750, feeScheduleId: FEE_SCHEDULE_V1_ID }, new Date()),
      );

      expect(payment).toMatchObject({ kind: "GAME_WALLET", status: "SUCCEEDED", amountCents: 750, feeCents: 0, rsvpId: rsvp.id });
      expect(await getWalletSummary(db, user.id, new Date())).toMatchObject({ balanceCents: 1250, heldCents: 0, availableCents: 1250 });
      expect(await db.walletEntry.findMany({ where: { kind: "GAME_PAYMENT" } })).toMatchObject([{ amountCents: -750 }]);
    });

    it("realizes only once", async () => {
      const { user } = await fundedWallet(2000);
      const rsvp = await makeRsvp(user.id, 1);
      await db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: rsvp.id, amountCents: 800 }));
      const input = { userId: user.id, rsvpId: rsvp.id, priceCents: 800, feeScheduleId: FEE_SCHEDULE_V1_ID };

      const first = await db.$transaction((tx) => realizeHold(tx, input, new Date()));
      const again = await db.$transaction((tx) => realizeHold(tx, input, new Date()));

      expect(again.id).toBe(first.id);
      expect((await getWalletSummary(db, user.id, new Date())).balanceCents).toBe(1200);
    });

    it("gives the money back to the available balance when a hold is released", async () => {
      const { user } = await fundedWallet(2000);
      const rsvp = await makeRsvp(user.id, 1);
      await db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: rsvp.id, amountCents: 800 }));

      await db.$transaction((tx) => releaseHold(tx, { rsvpId: rsvp.id }, new Date()));

      expect(await getWalletSummary(db, user.id, new Date())).toMatchObject({ balanceCents: 2000, heldCents: 0, availableCents: 2000 });
      await expect(
        db.$transaction((tx) => realizeHold(tx, { userId: user.id, rsvpId: rsvp.id, priceCents: 800, feeScheduleId: FEE_SCHEDULE_V1_ID }, new Date())),
      ).rejects.toThrow("already released");
    });

    it("charges immediately when joining a confirmed event, if the balance covers it", async () => {
      const { user } = await fundedWallet(2000);
      const rsvp = await makeRsvp(user.id, 1);

      await db.$transaction((tx) => chargeWalletNow(tx, { userId: user.id, rsvpId: rsvp.id, priceCents: 800, feeScheduleId: FEE_SCHEDULE_V1_ID }));
      expect((await getWalletSummary(db, user.id, new Date())).balanceCents).toBe(1200);

      const other = await makeRsvp(user.id, 2);
      await expect(
        db.$transaction((tx) => chargeWalletNow(tx, { userId: user.id, rsvpId: other.id, priceCents: 1300, feeScheduleId: FEE_SCHEDULE_V1_ID })),
      ).rejects.toThrow("Not enough in your wallet");
    });

    it("never lets concurrent holds overbook the balance", async () => {
      const { user } = await fundedWallet(2000);
      const rsvps = await Promise.all([1, 2, 3].map((n) => makeRsvp(user.id, n)));

      const results = await Promise.allSettled(
        rsvps.map((rsvp) => db.$transaction((tx) => placeHold(tx, { userId: user.id, rsvpId: rsvp.id, amountCents: 800 }))),
      );

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2); // 2000 covers two €8 holds, not three
      expect((await getWalletSummary(db, user.id, new Date())).availableCents).toBe(400);
    }, 20_000);
  });
});
