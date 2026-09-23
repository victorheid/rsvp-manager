import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";

/**
 * Feature test: exercises confirmEvent through the tRPC caller against a
 * real Postgres test database (per CLAUDE.md — no mocked Prisma). Needs
 * DATABASE_URL pointed at a disposable database (see README — `.env.test`
 * + `pnpm db:test:migrate`); skips itself otherwise.
 */
const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("confirmEvent", () => {
  const caller = appRouter.createCaller({
    db,
    user: { id: "organizer-1", phoneNumber: "+353000" },
    setSession: () => {},
    clearSession: () => {},
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("locks the per-head price at the current headcount and flips to confirmed", async () => {
    const organizer = await db.user.create({
      data: { id: "organizer-1", phoneNumber: "+353000", firstName: "Ana", lastInitial: "O" },
    });
    const group = await caller.groups.create({ name: "Thursday Basketball" });
    const player = await db.user.create({
      data: { phoneNumber: "+353111", firstName: "Ben", lastInitial: "L" },
    });

    const event = await db.event.create({
      data: {
        slug: "test-event",
        groupId: group.id,
        title: "Thursday game",
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        location: "Galway Sports Hall",
        cutoffAt: new Date(Date.now() + 3_600_000),
        minPlayers: 1,
        totalCostCents: 1000,
        pricingMode: PricingMode.SPLIT_EVENLY,
      },
    });

    await db.rsvp.create({
      data: { eventId: event.id, userId: player.id, paymentMethod: "CASH" },
    });

    const result = await caller.events.confirm({ eventId: event.id });

    expect(result.event.status).toBe("CONFIRMED");
    expect(result.event.lockedPriceCents).toBe(1000);
    expect(organizer.id).toBe("organizer-1");
  });
});
