import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod, PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { FEE_SCHEDULE_V1_ID, resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("rsvps", () => {
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

  async function createCashEvent(overrides: { maxPlayers?: number } = {}) {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353860000001", firstName: "Org", email: "+353860000001@example.test", emailVerifiedAt: new Date(), lastInitial: "O" },
    });
    const group = await db.group.create({
      data: { slug: "test-group", name: "Test Group", organizerId: organizer.id },
    });
    const event = await db.event.create({
      data: {
        slug: "test-event",
        groupId: group.id, feeScheduleId: FEE_SCHEDULE_V1_ID,
        title: "Thursday game",
        startsAt: new Date(Date.now() + 86_400_000),
        endsAt: new Date(Date.now() + 90_000_000),
        location: "Sports Hall",
        cutoffAt: new Date(Date.now() + 3_600_000),
        minPlayers: 1,
        maxPlayers: overrides.maxPlayers,
        totalCostCents: 1000,
        pricingMode: PricingMode.SPLIT_EVENLY,
        cashAllowed: true,
      },
    });
    return { organizer, group, event };
  }

  it("joins a cash-allowed event and auto-joins the group", async () => {
    const { event, group } = await createCashEvent();
    const player = await db.user.create({
      data: { phoneNumber: "+353860000002", firstName: "Ben", lastInitial: "L" },
    });
    const caller = callerAs(player.id, player.phoneNumber);

    const rsvp = await caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CASH });

    expect(rsvp.status).toBe("GOING");
    expect(rsvp.paymentMethod).toBe("CASH");

    const membership = await db.groupMembership.findUnique({
      where: { groupId_userId: { groupId: group.id, userId: player.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("rejects wallet/card RSVPs on a cash-only event", async () => {
    const { event } = await createCashEvent();
    const player = await db.user.create({
      data: { phoneNumber: "+353860000003", firstName: "Cy", lastInitial: "K" },
    });
    const caller = callerAs(player.id, player.phoneNumber);

    await expect(
      caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CARD }),
    ).rejects.toThrow("doesn't accept online payments");
    await expect(
      caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.WALLET }),
    ).rejects.toThrow("doesn't accept online payments");
  });

  it("rejects a second RSVP while already going", async () => {
    const { event } = await createCashEvent();
    const player = await db.user.create({
      data: { phoneNumber: "+353860000004", firstName: "Dee", lastInitial: "P" },
    });
    const caller = callerAs(player.id, player.phoneNumber);

    await caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CASH });

    await expect(
      caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CASH }),
    ).rejects.toThrow("already in");
  });

  it("rejects joining once the event is full", async () => {
    const { event } = await createCashEvent({ maxPlayers: 1 });
    const first = await db.user.create({
      data: { phoneNumber: "+353860000005", firstName: "Eve", lastInitial: "Q" },
    });
    const second = await db.user.create({
      data: { phoneNumber: "+353860000006", firstName: "Fay", lastInitial: "R" },
    });

    await callerAs(first.id, first.phoneNumber).rsvps.create({
      eventId: event.id,
      paymentMethod: PaymentMethod.CASH,
    });

    await expect(
      callerAs(second.id, second.phoneNumber).rsvps.create({
        eventId: event.id,
        paymentMethod: PaymentMethod.CASH,
      }),
    ).rejects.toThrow("full");
  });

  it("lets a player drop out and rejoin", async () => {
    const { event } = await createCashEvent();
    const player = await db.user.create({
      data: { phoneNumber: "+353860000007", firstName: "Gia", lastInitial: "S" },
    });
    const caller = callerAs(player.id, player.phoneNumber);

    await caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CASH });
    const dropped = await caller.rsvps.drop({ eventId: event.id });
    expect(dropped.status).toBe("CANCELLED");

    const rejoined = await caller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CASH });
    expect(rejoined.status).toBe("GOING");
  });

  it("frees a spot for someone else once a player drops out of a full event", async () => {
    const { event } = await createCashEvent({ maxPlayers: 1 });
    const first = await db.user.create({
      data: { phoneNumber: "+353860000008", firstName: "Hal", lastInitial: "T" },
    });
    const second = await db.user.create({
      data: { phoneNumber: "+353860000009", firstName: "Ivy", lastInitial: "U" },
    });

    const firstCaller = callerAs(first.id, first.phoneNumber);
    await firstCaller.rsvps.create({ eventId: event.id, paymentMethod: PaymentMethod.CASH });
    await firstCaller.rsvps.drop({ eventId: event.id });

    const rsvp = await callerAs(second.id, second.phoneNumber).rsvps.create({
      eventId: event.id,
      paymentMethod: PaymentMethod.CASH,
    });
    expect(rsvp.status).toBe("GOING");
  });

  it("rejects dropping out when not in the event", async () => {
    const { event } = await createCashEvent();
    const stranger = await db.user.create({
      data: { phoneNumber: "+353860000010", firstName: "Jay", lastInitial: "V" },
    });

    await expect(
      callerAs(stranger.id, stranger.phoneNumber).rsvps.drop({ eventId: event.id }),
    ).rejects.toThrow("not in this event");
  });
});
