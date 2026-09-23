import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { fakePaymentGateway } from "@/server/integrations/stripe/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("organizer onboarding and payment options", () => {
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

  async function setup() {
    const organizer = await db.user.create({ data: { phoneNumber: "+353830000001", firstName: "Org", lastInitial: "O" } });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await caller.groups.create({ name: "Futsal" });
    const startsAt = new Date(Date.now() + 86_400_000);
    const eventInput = {
      groupId: group.id,
      title: "Game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      location: "Court",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 800,
      pricingMode: PricingMode.FIXED_PER_HEAD,
    };
    return { organizer, caller, group, eventInput };
  }

  it("lets a new organizer run cash games, but not online ones", async () => {
    const { caller, eventInput } = await setup();

    const cash = await caller.events.create({ ...eventInput, cashAllowed: true });
    expect(cash).toMatchObject({ cashAllowed: true, onlineAllowed: false });

    await expect(caller.events.create({ ...eventInput, cashAllowed: true, onlineAllowed: true })).rejects.toThrow(
      "Finish payout setup",
    );
    await expect(caller.events.create({ ...eventInput })).rejects.toThrow("at least one way to pay");
  });

  it("allows online (and both) once onboarding is finished", async () => {
    const { caller, eventInput } = await setup();
    expect(await caller.payouts.onboardingStatus()).toEqual({ started: false, payoutsEnabled: false });

    const { url } = await caller.payouts.startOnboarding({ returnPath: "/g/futsal" });
    expect(url).toBe("http://localhost:3000/g/futsal");
    expect(await caller.payouts.refreshOnboarding()).toEqual({ payoutsEnabled: true });
    expect(await caller.payouts.onboardingStatus()).toEqual({ started: true, payoutsEnabled: true });

    const both = await caller.events.create({ ...eventInput, cashAllowed: true, onlineAllowed: true });
    expect(both).toMatchObject({ cashAllowed: true, onlineAllowed: true });
    const onlineOnly = await caller.events.create({ ...eventInput, title: "Online only", onlineAllowed: true });
    expect(onlineOnly).toMatchObject({ cashAllowed: false, onlineAllowed: true });
  });

  it("stays not-enabled while the organizer hasn't finished Stripe's form", async () => {
    fakePaymentGateway.onboardingCompletesImmediately = false;
    const { caller } = await setup();

    await caller.payouts.startOnboarding({ returnPath: "/" });

    expect(await caller.payouts.refreshOnboarding()).toEqual({ payoutsEnabled: false });
  });

  it("validates payment options on edit too", async () => {
    const { caller, eventInput } = await setup();
    const event = await caller.events.create({ ...eventInput, cashAllowed: true });

    await expect(
      caller.events.edit({ ...eventInput, eventId: event.id, cashAllowed: true, onlineAllowed: true }),
    ).rejects.toThrow("Finish payout setup");
  });

  it("refuses a return path that leaves the app", async () => {
    const { caller } = await setup();

    await expect(caller.payouts.startOnboarding({ returnPath: "https://evil.example" })).rejects.toThrow("Invalid return path");
  });
});
