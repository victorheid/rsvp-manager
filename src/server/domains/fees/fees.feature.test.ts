import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { resetDatabase } from "@/server/testing/resetDatabase";
import { getCurrentFeeSchedule, getFeeScheduleById, publishFeeSchedule } from "@/server/domains/fees";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("fee schedules", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const tiers = { gameCardFeeTiers: [{ upToCents: null, feeCents: 80 }], topUpFeeTiers: [{ upToCents: 10_000, feeCents: 300 }] };

  it("starts with version 1", async () => {
    const current = await getCurrentFeeSchedule(db, new Date());

    expect(current.version).toBe(1);
    expect(current.gameCardFeeTiers).toEqual([{ upToCents: null, feeCents: 50 }]);
  });

  it("publishes a new version without touching the old one", async () => {
    const effectiveFrom = new Date(Date.now() + 86_400_000);
    const published = await publishFeeSchedule(db, { effectiveFrom, ...tiers });

    expect(published.version).toBe(2);
    expect((await getFeeScheduleById(db, "fee_schedule_v1")).gameCardFeeTiers).toEqual([{ upToCents: null, feeCents: 50 }]);
    // Not in force until its date.
    expect((await getCurrentFeeSchedule(db, new Date())).version).toBe(1);
    expect((await getCurrentFeeSchedule(db, new Date(effectiveFrom.getTime() + 1))).version).toBe(2);
  });

  it("rejects malformed tiers, and a game schedule that can't price every amount", async () => {
    const effectiveFrom = new Date();

    await expect(publishFeeSchedule(db, { effectiveFrom, ...tiers, topUpFeeTiers: [] })).rejects.toThrow();
    await expect(
      publishFeeSchedule(db, { effectiveFrom, ...tiers, gameCardFeeTiers: [{ upToCents: 5000, feeCents: 50 }] }),
    ).rejects.toThrow("open-ended");
  });

  it("pins the schedule in force when an event is created, and duplicates take the current one", async () => {
    const organizer = await db.user.create({ data: { phoneNumber: "+353830000001", firstName: "Org", lastInitial: "O" } });
    const caller = appRouter.createCaller({
      db,
      user: { id: organizer.id, phoneNumber: organizer.phoneNumber },
      setSession: () => {},
      clearSession: () => {},
    });
    const group = await caller.groups.create({ name: "Futsal" });
    const startsAt = new Date(Date.now() + 86_400_000);
    const input = {
      groupId: group.id,
      title: "Game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      location: "Court",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 800,
      pricingMode: PricingMode.FIXED_PER_HEAD,
    };

    const first = await caller.events.create(input);
    const v2 = await publishFeeSchedule(db, { effectiveFrom: new Date(Date.now() - 1000), ...tiers });
    const repeat = await caller.events.create({ ...input, title: "Game again" });

    expect(first.feeScheduleId).toBe("fee_schedule_v1");
    expect(repeat.feeScheduleId).toBe(v2.id);
    // The first event keeps its fees even though a newer schedule is in force.
    expect((await getFeeScheduleById(db, first.feeScheduleId)).gameCardFeeTiers[0]?.feeCents).toBe(50);
  });
});
