import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";
import { autoConfirmDueEvents } from "./actions/autoConfirmDueEvents";
import { expireOverdueEvents } from "./actions/expireOverdueEvents";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("background jobs", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function createGroupAndOrganizer() {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353820000001", firstName: "Org", lastInitial: "O" },
    });
    const group = await db.group.create({
      data: { slug: "job-test-group", name: "Job Test Group", organizerId: organizer.id },
    });
    return { organizer, group };
  }

  describe("autoConfirmDueEvents", () => {
    it("confirms an open event past cut-off with the minimum met", async () => {
      const { group } = await createGroupAndOrganizer();
      const player = await db.user.create({
        data: { phoneNumber: "+353820000002", firstName: "Ana", lastInitial: "K" },
      });
      const now = new Date("2026-01-10T18:00:01Z");
      const event = await db.event.create({
        data: {
          slug: "due-event", groupId: group.id, title: "Due", startsAt: new Date("2026-01-11T18:00:00Z"),
          endsAt: new Date("2026-01-11T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T18:00:00Z"),
          minPlayers: 1, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD, autoChargeAtCutoff: true,
        },
      });
      await db.rsvp.create({ data: { eventId: event.id, userId: player.id, paymentMethod: "CASH" } });

      const confirmed = await autoConfirmDueEvents(db, now);

      expect(confirmed).toHaveLength(1);
      expect(confirmed[0]?.status).toBe("CONFIRMED");
      expect(confirmed[0]?.lockedPriceCents).toBe(1000);
    });

    it("leaves an event open if the minimum isn't met at cut-off", async () => {
      const { group } = await createGroupAndOrganizer();
      const now = new Date("2026-01-10T18:00:01Z");
      await db.event.create({
        data: {
          slug: "under-min", groupId: group.id, title: "Under min", startsAt: new Date("2026-01-11T18:00:00Z"),
          endsAt: new Date("2026-01-11T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T18:00:00Z"),
          minPlayers: 2, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD, autoChargeAtCutoff: true,
        },
      });

      const confirmed = await autoConfirmDueEvents(db, now);
      expect(confirmed).toHaveLength(0);
    });

    it("ignores events before cut-off or with auto-charge off", async () => {
      const { group } = await createGroupAndOrganizer();
      const now = new Date("2026-01-10T18:00:01Z");
      await db.event.create({
        data: {
          slug: "not-due-yet", groupId: group.id, title: "Not due", startsAt: new Date("2026-01-11T18:00:00Z"),
          endsAt: new Date("2026-01-11T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T19:00:00Z"),
          minPlayers: 1, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD, autoChargeAtCutoff: true,
        },
      });
      await db.event.create({
        data: {
          slug: "auto-charge-off", groupId: group.id, title: "Manual only", startsAt: new Date("2026-01-11T18:00:00Z"),
          endsAt: new Date("2026-01-11T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T17:00:00Z"),
          minPlayers: 1, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD, autoChargeAtCutoff: false,
        },
      });

      const confirmed = await autoConfirmDueEvents(db, now);
      expect(confirmed).toHaveLength(0);
    });
  });

  describe("expireOverdueEvents", () => {
    it("expires an open event 48h after its start", async () => {
      const { group } = await createGroupAndOrganizer();
      const startsAt = new Date("2026-01-10T18:00:00Z");
      const event = await db.event.create({
        data: {
          slug: "overdue", groupId: group.id, title: "Overdue", startsAt,
          endsAt: new Date("2026-01-10T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T17:00:00Z"),
          minPlayers: 4, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD,
        },
      });

      const now = new Date(startsAt.getTime() + 48 * 60 * 60 * 1000);
      const expired = await expireOverdueEvents(db, now);

      expect(expired.map((e) => e.id)).toContain(event.id);
      const reloaded = await db.event.findUniqueOrThrow({ where: { id: event.id } });
      expect(reloaded.status).toBe("EXPIRED");
    });

    it("doesn't expire an event before the 48h window is up", async () => {
      const { group } = await createGroupAndOrganizer();
      const startsAt = new Date("2026-01-10T18:00:00Z");
      await db.event.create({
        data: {
          slug: "too-soon", groupId: group.id, title: "Too soon", startsAt,
          endsAt: new Date("2026-01-10T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T17:00:00Z"),
          minPlayers: 4, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD,
        },
      });

      const now = new Date(startsAt.getTime() + 47 * 60 * 60 * 1000);
      const expired = await expireOverdueEvents(db, now);
      expect(expired).toHaveLength(0);
    });

    it("never expires a confirmed event, even 48h past its start", async () => {
      const { group } = await createGroupAndOrganizer();
      const startsAt = new Date("2026-01-10T18:00:00Z");
      await db.event.create({
        data: {
          slug: "already-confirmed", groupId: group.id, title: "Confirmed", startsAt,
          endsAt: new Date("2026-01-10T19:00:00Z"), location: "A", cutoffAt: new Date("2026-01-10T17:00:00Z"),
          minPlayers: 1, totalCostCents: 1000, pricingMode: PricingMode.FIXED_PER_HEAD,
          status: "CONFIRMED", confirmedAt: new Date("2026-01-10T17:30:00Z"), lockedPriceCents: 1000,
        },
      });

      const now = new Date(startsAt.getTime() + 48 * 60 * 60 * 1000);
      const expired = await expireOverdueEvents(db, now);
      expect(expired).toHaveLength(0);
    });
  });
});
