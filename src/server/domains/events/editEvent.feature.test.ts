import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("editEvent", () => {
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

  async function setup() {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353810000001", firstName: "Org", email: "+353810000001@example.test", emailVerifiedAt: new Date(), lastInitial: "O" },
    });
    const organizerCaller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await organizerCaller.groups.create({ name: "Monday Squash" });
    const startsAt = new Date(Date.now() + 86_400_000);

    const event = await organizerCaller.events.create({
      groupId: group.id,
      title: "Monday game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      minPlayers: 1,
      maxPlayers: 6,
      totalCostCents: 1000,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    return { organizer, organizerCaller, group, event, startsAt };
  }

  function editInputFor(event: Awaited<ReturnType<typeof setup>>["event"], overrides: Record<string, unknown> = {}) {
    return {
      eventId: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.location,
      cutoffAt: event.cutoffAt,
      minPlayers: event.minPlayers,
      maxPlayers: event.maxPlayers ?? undefined,
      totalCostCents: event.totalCostCents,
      pricingMode: event.pricingMode,
      cashAllowed: event.cashAllowed,
      autoChargeAtCutoff: event.autoChargeAtCutoff,
      ...overrides,
    };
  }

  it("edits an open event with no RSVPs yet", async () => {
    const { organizerCaller, event } = await setup();

    const edited = await organizerCaller.events.edit(editInputFor(event, { location: "Court 2", totalCostCents: 500 }));

    expect(edited.location).toBe("Court 2");
    expect(edited.totalCostCents).toBe(500);
  });

  it("rejects a price increase once someone has RSVP'd, but allows a decrease", async () => {
    const { organizerCaller, event } = await setup();
    const player = await db.user.create({
      data: { phoneNumber: "+353810000002", firstName: "Zed", lastInitial: "F" },
    });
    await callerAs(player.id, player.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    await expect(
      organizerCaller.events.edit(editInputFor(event, { totalCostCents: 2000 })),
    ).rejects.toThrow("can't go up");

    const edited = await organizerCaller.events.edit(editInputFor(event, { totalCostCents: 500 }));
    expect(edited.totalCostCents).toBe(500);
  });

  it("rejects a pricing mode change once someone has RSVP'd", async () => {
    const { organizerCaller, event } = await setup();
    const player = await db.user.create({
      data: { phoneNumber: "+353810000003", firstName: "Yas", lastInitial: "G" },
    });
    await callerAs(player.id, player.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    await expect(
      organizerCaller.events.edit(editInputFor(event, { pricingMode: PricingMode.SPLIT_EVENLY })),
    ).rejects.toThrow("Pricing mode can't change");
  });

  it("rejects lowering max below the current headcount", async () => {
    const { organizerCaller, event } = await setup();
    const first = await db.user.create({
      data: { phoneNumber: "+353810000004", firstName: "Xan", lastInitial: "H" },
    });
    const second = await db.user.create({
      data: { phoneNumber: "+353810000007", firstName: "Una", lastInitial: "K" },
    });
    await callerAs(first.id, first.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await callerAs(second.id, second.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    await expect(
      organizerCaller.events.edit(editInputFor(event, { maxPlayers: 1 })),
    ).rejects.toThrow("Can't lower max");
  });

  it("rejects editing a confirmed event", async () => {
    const { organizerCaller, event } = await setup();
    const player = await db.user.create({
      data: { phoneNumber: "+353810000005", firstName: "Wex", lastInitial: "I" },
    });
    await callerAs(player.id, player.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await organizerCaller.events.confirm({ eventId: event.id });

    await expect(
      organizerCaller.events.edit(editInputFor(event, { location: "New spot" })),
    ).rejects.toThrow("nothing left to edit");
  });

  it("rejects a non-organizer editing the event", async () => {
    const { event } = await setup();
    const impostor = await db.user.create({
      data: { phoneNumber: "+353810000006", firstName: "Vex", lastInitial: "J" },
    });

    await expect(
      callerAs(impostor.id, impostor.phoneNumber).events.edit(editInputFor(event)),
    ).rejects.toThrow("Only the group's organizer");
  });
});
