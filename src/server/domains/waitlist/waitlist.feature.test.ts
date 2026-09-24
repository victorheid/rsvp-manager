import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { advanceWaitlists } from "@/server/domains/waitlist";
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

  async function setup(maxPlayers = 1, waitlistMode: "IN_ORDER" | "FIRST_TO_CLAIM" = "IN_ORDER") {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353800100001", firstName: "Org", email: "+353800100001@example.test", emailVerifiedAt: new Date(), lastInitial: "O" },
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
      waitlistMode,
    });

    return { organizer, organizerCaller, group, event };
  }

  let phoneSeq = 100;
  async function player(name: string) {
    phoneSeq += 1;
    const phoneNumber = `+353800100${phoneSeq}`;
    const user = await db.user.create({ data: { phoneNumber, firstName: name, lastInitial: "X" } });
    return { user, caller: callerAs(user.id, phoneNumber) };
  }

  /** A full one-spot game with `names` on the waitlist, in that order. */
  async function fullGame(names: string[], waitlistMode: "IN_ORDER" | "FIRST_TO_CLAIM" = "IN_ORDER") {
    const game = await setup(1, waitlistMode);
    const holder = await player("Holder");
    await holder.caller.rsvps.create({ eventId: game.event.id, paymentMethod: "CASH" });
    const waiters = [];
    for (const name of names) {
      const waiter = await player(name);
      await waiter.caller.waitlist.join({ eventId: game.event.id });
      waiters.push(waiter);
    }
    return { ...game, holder, waiters };
  }

  function nth<T>(list: readonly T[], index: number): T {
    const item = list[index];
    if (item === undefined) throw new Error(`No item at ${index}`);
    return item;
  }

  const entryOf = (eventId: string, userId: string) =>
    db.waitlistEntry.findUniqueOrThrow({ where: { eventId_userId: { eventId, userId } } });

  it("rejects joining the waitlist when the event isn't full", async () => {
    const { event } = await setup(10);
    const ana = await player("Ana");

    await expect(ana.caller.waitlist.join({ eventId: event.id })).rejects.toThrow("isn't full");
  });

  it("joins the waitlist in one tap once full, in join order, and shows the viewer's place", async () => {
    const { event, waiters } = await fullGame(["Ben", "Cy"]);
    const ben = nth(waiters, 0);
    const cy = nth(waiters, 1);

    const view = await cy.caller.events.getBySlug({ slug: event.slug });
    expect(view.waitlistEntries.map((e) => e.userId)).toEqual([ben.user.id, cy.user.id]);
    expect(view.viewerWaitlist).toEqual({ position: 2, heldUntil: null, spotOpen: false });
  });

  it("is idempotent — joining twice doesn't duplicate or move position", async () => {
    const { event, waiters } = await fullGame(["Fay"]);
    const before = await entryOf(event.id, nth(waiters, 0).user.id);

    await nth(waiters, 0).caller.waitlist.join({ eventId: event.id });

    expect(await db.waitlistEntry.count({ where: { eventId: event.id } })).toBe(1);
    expect((await entryOf(event.id, nth(waiters, 0).user.id)).queuedAt).toEqual(before.queuedAt);
  });

  it("leaving keeps them listed under Dropped out; coming back puts them at the end", async () => {
    const { event, waiters } = await fullGame(["Hal", "Ivy"]);
    const hal = nth(waiters, 0);
    const ivy = nth(waiters, 1);

    await hal.caller.waitlist.leave({ eventId: event.id });

    const view = await ivy.caller.events.getBySlug({ slug: event.slug });
    expect(view.waitlistEntries.map((e) => e.userId)).toEqual([ivy.user.id]);
    expect(view.droppedOut.map((d) => d.user.firstName)).toEqual(["Hal"]);
    await expect(hal.caller.waitlist.leave({ eventId: event.id })).rejects.toThrow("not on the waitlist");

    await hal.caller.waitlist.join({ eventId: event.id });
    const after = await ivy.caller.events.getBySlug({ slug: event.slug });
    expect(after.waitlistEntries.map((e) => e.userId)).toEqual([ivy.user.id, hal.user.id]);
  });

  describe("in order (§6)", () => {
    it("holds a freed spot for the first person: nobody else can take it, they can", async () => {
      const { event, holder, waiters } = await fullGame(["Jay", "Kim"]);
      const jay = nth(waiters, 0);
      const kim = nth(waiters, 1);
      const before = Date.now();

      await holder.caller.rsvps.drop({ eventId: event.id });

      const held = await entryOf(event.id, jay.user.id);
      expect(held.heldUntil?.getTime()).toBeGreaterThanOrEqual(before + 60 * 60_000);
      expect((await jay.caller.events.getBySlug({ slug: event.slug })).viewerWaitlist).toMatchObject({ position: 1, heldUntil: held.heldUntil });
      await expect(kim.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" })).rejects.toThrow("full");
      await expect(kim.caller.waitlist.join({ eventId: event.id })).resolves.toBeTruthy(); // still full for her

      await jay.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

      expect(await db.waitlistEntry.count({ where: { eventId: event.id, userId: jay.user.id } })).toBe(0);
      expect((await db.rsvp.findFirstOrThrow({ where: { eventId: event.id, userId: jay.user.id } })).status).toBe("GOING");
    });

    it("a hold that runs out sends them to the end and holds the spot for the next person", async () => {
      const { event, holder, waiters } = await fullGame(["Leo", "Mo"]);
      const leo = nth(waiters, 0);
      const mo = nth(waiters, 1);
      await holder.caller.rsvps.drop({ eventId: event.id });

      await advanceWaitlists(db, new Date(Date.now() + 61 * 60_000));

      const missed = await entryOf(event.id, leo.user.id);
      expect(missed).toMatchObject({ heldUntil: null, status: "WAITING" });
      expect(missed.missedHoldAt).not.toBeNull();
      expect((await entryOf(event.id, mo.user.id)).heldUntil).not.toBeNull();
      const view = await leo.caller.events.getBySlug({ slug: event.slug });
      expect(view.waitlistEntries.map((e) => e.userId)).toEqual([mo.user.id, leo.user.id]);
    });

    it("never lets someone take a spot after their hold ran out, even before the worker ran", async () => {
      const { event, holder, waiters } = await fullGame(["Ned", "Oz"]);
      const ned = nth(waiters, 0);
      const oz = nth(waiters, 1);
      await holder.caller.rsvps.drop({ eventId: event.id });
      await db.waitlistEntry.update({
        where: { eventId_userId: { eventId: event.id, userId: ned.user.id } },
        data: { heldUntil: new Date(Date.now() - 1000) },
      });

      await expect(ned.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" })).rejects.toThrow("full");
      expect((await entryOf(event.id, oz.user.id)).heldUntil).not.toBeNull(); // handed on straight away
    });

    it("leaving with a spot held passes it to the next person", async () => {
      const { event, holder, waiters } = await fullGame(["Pip", "Quinn"]);
      const pip = nth(waiters, 0);
      const quinn = nth(waiters, 1);
      await holder.caller.rsvps.drop({ eventId: event.id });

      await pip.caller.waitlist.leave({ eventId: event.id });

      expect((await entryOf(event.id, quinn.user.id)).heldUntil).not.toBeNull();
    });

    it("holds room the organizer added for the next people (worker sweep)", async () => {
      const { event, organizerCaller, waiters } = await fullGame(["Rae"]);
      const current = await db.event.findUniqueOrThrow({ where: { id: event.id } });
      await organizerCaller.events.edit({
        eventId: event.id, title: current.title, startsAt: current.startsAt, endsAt: current.endsAt, location: current.location,
        cutoffAt: current.cutoffAt, totalCostCents: current.totalCostCents, pricingMode: current.pricingMode, cashAllowed: true, maxPlayers: 2,
      });

      await advanceWaitlists(db, new Date());

      expect((await entryOf(event.id, nth(waiters, 0).user.id)).heldUntil).not.toBeNull();
    });
  });

  describe("first to claim (§6)", () => {
    it("holds nothing: the first on the waitlist to take the freed spot gets it", async () => {
      const { event, holder, waiters } = await fullGame(["Sam", "Tia"], "FIRST_TO_CLAIM");
      const sam = nth(waiters, 0);
      const tia = nth(waiters, 1);

      await holder.caller.rsvps.drop({ eventId: event.id });
      expect(await db.waitlistEntry.count({ where: { eventId: event.id, heldUntil: { not: null } } })).toBe(0);
      expect((await sam.caller.events.getBySlug({ slug: event.slug })).viewerWaitlist).toMatchObject({ spotOpen: true });

      await tia.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

      await expect(sam.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" })).rejects.toThrow("full");
      expect((await db.waitlistEntry.findMany({ where: { eventId: event.id } })).map((e) => e.userId)).toEqual([sam.user.id]);
    });
  });

  describe("organizer marks a waitlister dropped out (§8)", () => {
    it("moves them to Dropped out and hands a held spot to the next person", async () => {
      const { event, holder, organizerCaller, waiters } = await fullGame(["Uma", "Vic"]);
      const uma = nth(waiters, 0);
      const vic = nth(waiters, 1);
      await holder.caller.rsvps.drop({ eventId: event.id });
      const entry = await entryOf(event.id, uma.user.id);

      await organizerCaller.waitlist.markDroppedOut({ entryId: entry.id });

      expect(await entryOf(event.id, uma.user.id)).toMatchObject({ status: "DROPPED_OUT", heldUntil: null });
      expect((await entryOf(event.id, vic.user.id)).heldUntil).not.toBeNull();
      const manage = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
      expect(manage.waitlist.map((w) => w.user.firstName)).toEqual(["Vic"]);
      expect(manage.droppedFromWaitlist.map((w) => w.user.firstName)).toEqual(["Uma"]);
    });

    it("is organizer only, and offered on every waiting row before the start", async () => {
      const { event, organizerCaller, waiters } = await fullGame(["Wes"]);
      const entry = await entryOf(event.id, nth(waiters, 0).user.id);

      await expect(nth(waiters, 0).caller.waitlist.markDroppedOut({ entryId: entry.id })).rejects.toThrow("organizer");
      const manage = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
      expect(manage.waitlist[0]?.actions).toEqual(["MARK_DROPPED_OUT"]);
    });
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
