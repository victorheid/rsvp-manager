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
    // Split, no max set: "up to total ÷ min" (§2).
    expect(fetched.priceDisplay).toEqual({ mode: "range", minCents: null, maxCents: 8000 });
    expect(fetched.viewerRsvp).toBeNull();
  });

  it("shows a fixed price, and the locked price once confirmed", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);

    const created = await caller.events.create({
      groupId: group.id,
      title: "Fixed price game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 2",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 1000,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    const beforeConfirm = await caller.events.getBySlug({ slug: created.slug });
    expect(beforeConfirm.priceDisplay).toEqual({ mode: "fixed", amountCents: 1000 });

    const player = await db.user.create({
      data: { phoneNumber: "+353850000099", firstName: "Kim", lastInitial: "Z" },
    });
    await callerAs(player.id, player.phoneNumber).rsvps.create({
      eventId: created.id,
      paymentMethod: "CASH",
    });

    await caller.events.confirm({ eventId: created.id });

    const afterConfirm = await caller.events.getBySlug({ slug: created.slug });
    expect(afterConfirm.priceDisplay).toEqual({ mode: "locked", amountCents: 1000 });
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
        cashAllowed: true,
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
      cashAllowed: true,
    });

    const fetched = await caller.events.getBySlug({ slug: created.slug });
    expect(fetched.costBreakdown).toEqual([]);
  });

  it("rejects creating an event in someone else's group", async () => {
    const { group } = await createOrganizerAndGroup();
    const impostor = await db.user.create({
      data: { phoneNumber: "+353850000002", firstName: "Im", lastInitial: "P" },
    });
    const startsAt = new Date(Date.now() + 86_400_000);

    await expect(
      callerAs(impostor.id, impostor.phoneNumber).events.create({
        groupId: group.id,
        title: "Not your group",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        location: "Court 1",
        cutoffAt: new Date(Date.now() + 3_600_000),
        totalCostCents: 5000,
        pricingMode: PricingMode.FIXED_PER_HEAD,
        cashAllowed: true,
      }),
    ).rejects.toThrow("Only the group's organizer");
  });

  it("rejects confirming someone else's event", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);

    const event = await caller.events.create({
      groupId: group.id,
      title: "Owned event",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 5000,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    const impostor = await db.user.create({
      data: { phoneNumber: "+353850000003", firstName: "Im", lastInitial: "P" },
    });

    await expect(
      callerAs(impostor.id, impostor.phoneNumber).events.confirm({ eventId: event.id }),
    ).rejects.toThrow("Only the group's organizer");
  });

  it("cancels an open or confirmed event, but not twice", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);

    const event = await caller.events.create({
      groupId: group.id,
      title: "Rainy day game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 5000,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    const cancelled = await caller.events.cancel({ eventId: event.id });
    expect(cancelled.status).toBe("CANCELLED");

    await expect(caller.events.cancel({ eventId: event.id })).rejects.toThrow("already cancelled");
  });

  it("rejects cancelling someone else's event", async () => {
    const { caller, group } = await createOrganizerAndGroup();
    const startsAt = new Date(Date.now() + 86_400_000);

    const event = await caller.events.create({
      groupId: group.id,
      title: "Owned event 2",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 5000,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    const impostor = await db.user.create({
      data: { phoneNumber: "+353850000004", firstName: "Im", lastInitial: "P" },
    });

    await expect(
      callerAs(impostor.id, impostor.phoneNumber).events.cancel({ eventId: event.id }),
    ).rejects.toThrow("Only the group's organizer");
  });
  describe("suggestDefaults", () => {
    it("copies the last game's setup and re-anchors it to the picked date", async () => {
      const { caller, group } = await createOrganizerAndGroup();
      const lastStart = new Date("2030-09-17T18:00:00Z");
      await caller.events.create({
        groupId: group.id,
        title: "Thursday 5-a-side",
        startsAt: lastStart,
        endsAt: new Date(lastStart.getTime() + 90 * 60 * 1000),
        location: "Westside Sports Hall",
        cutoffAt: new Date(lastStart.getTime() - 6 * 60 * 60 * 1000),
        minPlayers: 6,
        maxPlayers: 12,
        totalCostCents: 8000,
        pricingMode: PricingMode.SPLIT_EVENLY,
        cashAllowed: true,
      });

      const nextStart = new Date("2030-09-24T18:00:00Z");
      const defaults = await caller.events.suggestDefaults({ groupId: group.id, startsAt: nextStart });

      expect(defaults).toMatchObject({
        title: "Tuesday 5-a-side",
        location: "Westside Sports Hall",
        minPlayers: 6,
        maxPlayers: 12,
        totalCostCents: 8000,
        basedOnTitle: "Thursday 5-a-side",
      });
      expect(defaults.endsAt).toEqual(new Date("2030-09-24T19:30:00Z"));
      expect(defaults.cutoffAt).toEqual(new Date("2030-09-24T12:00:00Z"));
    });

    it("falls back to the group's name and blanks for a group's first game", async () => {
      const { caller, group } = await createOrganizerAndGroup();

      const defaults = await caller.events.suggestDefaults({
        groupId: group.id,
        startsAt: new Date("2030-09-24T18:00:00Z"),
      });

      expect(defaults.basedOnTitle).toBeNull();
      // The group's name already leads with a weekday, so it's swapped, not prefixed.
      expect(defaults.title).toBe("Tuesday Volleyball");
      expect(defaults.location).toBe("");
    });

    it("rejects someone who doesn't organize the group", async () => {
      const { group } = await createOrganizerAndGroup();
      const stranger = await db.user.create({
        data: { phoneNumber: "+353850000002", firstName: "Sam", lastInitial: "S" },
      });

      await expect(
        callerAs(stranger.id, stranger.phoneNumber).events.suggestDefaults({
          groupId: group.id,
          startsAt: new Date("2030-09-24T18:00:00Z"),
        }),
      ).rejects.toThrow("Only the group's organizer");
    });
  });
});
