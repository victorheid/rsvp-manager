import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { FEE_SCHEDULE_V1_ID, resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("waitlist", () => {
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

  async function setup(maxPlayers = 1) {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353800100001", firstName: "Org", lastInitial: "O" },
    });
    const organizerCaller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await organizerCaller.groups.create({ name: "Full Group" });
    const startsAt = new Date(Date.now() + 86_400_000);

    const event = await organizerCaller.events.create({
      groupId: group.id,
      title: "Full game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      maxPlayers,
      totalCostCents: 500,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    return { organizer, organizerCaller, group, event };
  }

  it("rejects joining the waitlist when the event isn't full", async () => {
    const { event } = await setup(10);
    const player = await db.user.create({
      data: { phoneNumber: "+353800100002", firstName: "Ana", lastInitial: "K" },
    });

    await expect(
      callerAs(player.id, player.phoneNumber).waitlist.join({ eventId: event.id }),
    ).rejects.toThrow("isn't full");
  });

  it("joins the waitlist once full, in join order, and shows on the event", async () => {
    const { event } = await setup(1);
    const first = await db.user.create({
      data: { phoneNumber: "+353800100003", firstName: "Ben", lastInitial: "L" },
    });
    const second = await db.user.create({
      data: { phoneNumber: "+353800100004", firstName: "Cy", lastInitial: "M" },
    });
    const third = await db.user.create({
      data: { phoneNumber: "+353800100005", firstName: "Dee", lastInitial: "N" },
    });

    // Fill the one spot.
    await callerAs(first.id, first.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    await callerAs(second.id, second.phoneNumber).waitlist.join({ eventId: event.id });
    await callerAs(third.id, third.phoneNumber).waitlist.join({ eventId: event.id });

    const view = await callerAs(third.id, third.phoneNumber).events.getBySlug({ slug: event.slug });
    expect(view.waitlistEntries.map((e) => e.userId)).toEqual([second.id, third.id]);
    expect(view.viewerWaitlistPosition).toBe(2);
  });

  it("is idempotent — joining twice doesn't duplicate or move position", async () => {
    const { event } = await setup(1);
    const filler = await db.user.create({
      data: { phoneNumber: "+353800100006", firstName: "Eve", lastInitial: "P" },
    });
    const player = await db.user.create({
      data: { phoneNumber: "+353800100007", firstName: "Fay", lastInitial: "Q" },
    });
    await callerAs(filler.id, filler.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    const caller = callerAs(player.id, player.phoneNumber);
    await caller.waitlist.join({ eventId: event.id });
    await caller.waitlist.join({ eventId: event.id });

    const count = await db.waitlistEntry.count({ where: { eventId: event.id } });
    expect(count).toBe(1);
  });

  it("lets someone leave the waitlist", async () => {
    const { event } = await setup(1);
    const filler = await db.user.create({
      data: { phoneNumber: "+353800100008", firstName: "Gia", lastInitial: "R" },
    });
    const player = await db.user.create({
      data: { phoneNumber: "+353800100009", firstName: "Hal", lastInitial: "S" },
    });
    await callerAs(filler.id, filler.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    const caller = callerAs(player.id, player.phoneNumber);
    await caller.waitlist.join({ eventId: event.id });
    await caller.waitlist.leave({ eventId: event.id });

    const count = await db.waitlistEntry.count({ where: { eventId: event.id } });
    expect(count).toBe(0);
    await expect(caller.waitlist.leave({ eventId: event.id })).rejects.toThrow("not on the waitlist");
  });

  it("claiming a spot (a normal RSVP) clears the waitlist entry, first come first served", async () => {
    const { event } = await setup(1);
    const filler = await db.user.create({
      data: { phoneNumber: "+353800100010", firstName: "Ivy", lastInitial: "T" },
    });
    const waiter1 = await db.user.create({
      data: { phoneNumber: "+353800100011", firstName: "Jay", lastInitial: "U" },
    });
    const waiter2 = await db.user.create({
      data: { phoneNumber: "+353800100012", firstName: "Kim", lastInitial: "V" },
    });

    const fillerCaller = callerAs(filler.id, filler.phoneNumber);
    await fillerCaller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    const waiter1Caller = callerAs(waiter1.id, waiter1.phoneNumber);
    const waiter2Caller = callerAs(waiter2.id, waiter2.phoneNumber);
    await waiter1Caller.waitlist.join({ eventId: event.id });
    await waiter2Caller.waitlist.join({ eventId: event.id });

    // Filler drops out, freeing the one spot.
    await fillerCaller.rsvps.drop({ eventId: event.id });

    // Second waiter claims it first.
    await waiter2Caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    const remainingWaitlist = await db.waitlistEntry.findMany({ where: { eventId: event.id } });
    expect(remainingWaitlist.map((e) => e.userId)).toEqual([waiter1.id]);

    // First waiter is now too late — event is full again.
    await expect(
      waiter1Caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" }),
    ).rejects.toThrow("full");
  });

  it("closes the waitlist once the event has started", async () => {
    const { organizer, group } = await setup(1);
    const startedEvent = await db.event.create({
      data: {
        slug: "already-started", groupId: group.id, feeScheduleId: FEE_SCHEDULE_V1_ID, title: "Started", startsAt: new Date(Date.now() - 1000),
        endsAt: new Date(Date.now() + 3_600_000), location: "A", cutoffAt: new Date(Date.now() - 10_000),
        maxPlayers: 1, totalCostCents: 500, pricingMode: PricingMode.FIXED_PER_HEAD, cashAllowed: true,
      },
    });
    await db.rsvp.create({ data: { eventId: startedEvent.id, userId: organizer.id, paymentMethod: "CASH" } });

    const player = await db.user.create({
      data: { phoneNumber: "+353800100013", firstName: "Leo", lastInitial: "W" },
    });

    await expect(
      callerAs(player.id, player.phoneNumber).waitlist.join({ eventId: startedEvent.id }),
    ).rejects.toThrow("closed");
  });
});
