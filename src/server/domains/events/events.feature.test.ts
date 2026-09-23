import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("events", () => {
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
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function createOrganizerAndGroup() {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353850000001", firstName: "Org", lastInitial: "O" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await caller.groups.create({ name: "Wednesday Volleyball" });
    return { organizer, caller, group };
  }

  it("creates an event with a cost breakdown, and returns it parsed on read", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);
    const endsAt = new Date(startsAt.getTime() + 90 * 60 * 1000);

    const created = await caller.events.create({
      groupId: group.id,
      title: "Wednesday game",
      startsAt,
      endsAt,
      location: "Court 3",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 8000,
      costBreakdown: [{ label: "Court booking", amountCents: 8000 }],
      pricingMode: PricingMode.SPLIT_EVENLY,
      cashAllowed: true,
    });

    const fetched = await caller.events.getBySlug({ slug: created.slug });
    expect(fetched.costBreakdown).toEqual([{ label: "Court booking", amountCents: 8000 }]);
    expect(fetched.endsAt.getTime()).toBe(endsAt.getTime());
  });

  it("rejects an end time at or before the start time", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);

    await expect(
      caller.events.create({
        groupId: group.id,
        title: "Bad event",
        startsAt,
        endsAt: startsAt,
        location: "Court 3",
        cutoffAt: new Date(Date.now() + 3_600_000),
        totalCostCents: 8000,
        pricingMode: PricingMode.FIXED_PER_HEAD,
      }),
    ).rejects.toThrow("End time must be after");
  });

  it("defaults costBreakdown to an empty array when none was given", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);

    const created = await caller.events.create({
      groupId: group.id,
      title: "No breakdown",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 5000,
      pricingMode: PricingMode.FIXED_PER_HEAD,
    });

    const fetched = await caller.events.getBySlug({ slug: created.slug });
    expect(fetched.costBreakdown).toEqual([]);
  });
});
