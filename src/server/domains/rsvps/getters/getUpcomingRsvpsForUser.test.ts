import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";
import { getUpcomingRsvpsForUser } from "./getUpcomingRsvpsForUser";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("getUpcomingRsvpsForUser", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns only upcoming GOING rsvps, soonest first", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353840000001", firstName: "Org", lastInitial: "O" },
    });
    const player = await db.user.create({
      data: { phoneNumber: "+353840000002", firstName: "Zoe", lastInitial: "T" },
    });
    const group = await db.group.create({
      data: { slug: "test-group", name: "Test Group", organizerId: organizer.id },
    });

    const soon = await db.event.create({
      data: {
        slug: "soon", groupId: group.id, title: "Soon", startsAt: new Date(Date.now() + 3_600_000),
        endsAt: new Date(Date.now() + 7_200_000), location: "A", cutoffAt: new Date(Date.now() + 1_800_000),
        totalCostCents: 500, pricingMode: PricingMode.FIXED_PER_HEAD,
      },
    });
    const later = await db.event.create({
      data: {
        slug: "later", groupId: group.id, title: "Later", startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000), location: "A", cutoffAt: new Date(Date.now() + 1_800_000),
        totalCostCents: 500, pricingMode: PricingMode.FIXED_PER_HEAD,
      },
    });
    const past = await db.event.create({
      data: {
        slug: "past", groupId: group.id, title: "Past", startsAt: new Date(Date.now() - 86_400_000),
        endsAt: new Date(Date.now() - 82_800_000), location: "A", cutoffAt: new Date(Date.now() - 90_000_000),
        totalCostCents: 500, pricingMode: PricingMode.FIXED_PER_HEAD,
      },
    });

    await db.rsvp.create({ data: { eventId: later.id, userId: player.id, paymentMethod: "CASH" } });
    await db.rsvp.create({ data: { eventId: soon.id, userId: player.id, paymentMethod: "CASH" } });
    await db.rsvp.create({ data: { eventId: past.id, userId: player.id, paymentMethod: "CASH" } });
    await db.rsvp.create({
      data: { eventId: soon.id, userId: organizer.id, paymentMethod: "CASH", status: "CANCELLED" },
    });

    const rsvps = await getUpcomingRsvpsForUser(db, player.id, new Date());

    expect(rsvps.map((r) => r.event.slug)).toEqual(["soon", "later"]);
  });
});
