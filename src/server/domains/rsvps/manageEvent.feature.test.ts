import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("organizer event management", () => {
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
      data: { phoneNumber: "+353830000001", firstName: "Org", email: "+353830000001@example.test", emailVerifiedAt: new Date(), lastInitial: "O" },
    });
    const organizerCaller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await organizerCaller.groups.create({ name: "Friday Futsal" });
    const startsAt = new Date(Date.now() + 86_400_000);
    const event = await organizerCaller.events.create({
      groupId: group.id,
      title: "Friday game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      totalCostCents: 800,
      pricingMode: PricingMode.FIXED_PER_HEAD,
      cashAllowed: true,
    });

    const player = await db.user.create({
      data: { phoneNumber: "+353830000002", firstName: "Zia", lastInitial: "N" },
    });
    const playerCaller = callerAs(player.id, player.phoneNumber);
    const rsvp = await playerCaller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    return { organizer, organizerCaller, group, event, player, playerCaller, rsvp };
  }

  /** Moves the game's start into the past, so it's Live (or Finished with `finished`). */
  async function startGame(eventId: string, finished = false) {
    const now = Date.now();
    await db.event.update({
      where: { id: eventId },
      data: {
        startsAt: new Date(now - (finished ? 7_200_000 : 1_800_000)),
        endsAt: new Date(now + (finished ? -3_600_000 : 1_800_000)),
        cutoffAt: new Date(now - 3_600_000 * 3),
      },
    });
  }

  it("lists rsvps for the organizer, including dropped-out ones", async () => {
    const { organizerCaller, event, playerCaller } = await setup();

    await playerCaller.rsvps.drop({ eventId: event.id });

    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
    expect(view.rsvps).toHaveLength(1);
    expect(view.rsvps[0]?.status).toBe("CANCELLED");
  });

  it("rejects a non-organizer viewing the manage list", async () => {
    const { event, player, playerCaller } = await setup();
    void player;

    await expect(playerCaller.rsvps.forOrganizer({ eventId: event.id })).rejects.toThrow(
      "Only the group's organizer",
    );
  });

  it("marks attendance and tracks no-shows per group", async () => {
    const { organizerCaller, event, rsvp } = await setup();
    await organizerCaller.events.confirm({ eventId: event.id });
    await startGame(event.id);

    const updated = await organizerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: false });
    expect(updated.attended).toBe(false);

    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
    expect(view.rsvps[0]?.noShowCount).toBe(1);
  });

  it("marks a cash rsvp as paid outside app, but not twice", async () => {
    const { organizerCaller, event, rsvp } = await setup();
    await organizerCaller.events.confirm({ eventId: event.id });

    const updated = await organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id });
    expect(updated.paymentStatus).toBe("PAID_OUTSIDE_APP");

    await expect(organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id })).rejects.toThrow("Already");
  });

  it("lets the organizer remove a player, freeing their spot", async () => {
    const { organizerCaller, rsvp } = await setup();

    const removed = await organizerCaller.rsvps.markDroppedOut({ rsvpId: rsvp.id });
    expect(removed.status).toBe("CANCELLED");

    await expect(organizerCaller.rsvps.markDroppedOut({ rsvpId: rsvp.id })).rejects.toThrow("Already dropped out");
  });

  it("rejects attendance/payment/remove actions from a non-organizer", async () => {
    const { rsvp, playerCaller } = await setup();

    await expect(
      playerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: true }),
    ).rejects.toThrow("Only the group's organizer");
    await expect(playerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id })).rejects.toThrow(
      "Only the group's organizer",
    );
    await expect(playerCaller.rsvps.markDroppedOut({ rsvpId: rsvp.id })).rejects.toThrow(
      "Only the group's organizer",
    );
  });

  it("adds a walk-in, shown in the manage list but not against max", async () => {
    const { organizerCaller, event } = await setup();

    const walkIn = await organizerCaller.rsvps.addWalkIn({
      eventId: event.id,
      name: "Drop-in Dana",
      paymentStatus: "PAID_OUTSIDE_APP",
    });
    expect(walkIn.walkInName).toBe("Drop-in Dana");
    expect(walkIn.userId).toBeNull();

    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
    expect(view.rsvps.map((r) => r.walkInName)).toContain("Drop-in Dana");
  });

  it("rejects a non-organizer adding a walk-in", async () => {
    const { event, playerCaller } = await setup();

    await expect(
      playerCaller.rsvps.addWalkIn({ eventId: event.id, name: "Sneaky", paymentStatus: "OWES" }),
    ).rejects.toThrow("Only the group's organizer");
  });

  it("doesn't let a walk-in count against max", async () => {
    const { organizerCaller, group } = await setup();
    const startsAt = new Date(Date.now() + 86_400_000);
    const event = await organizerCaller.events.create({
      groupId: group.id,
      title: "Capped game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
      location: "Court 2",
      cutoffAt: new Date(Date.now() + 3_600_000),
      maxPlayers: 1,
      totalCostCents: 500,
      pricingMode: "FIXED_PER_HEAD",
      cashAllowed: true,
    });

    // Fill the one real spot.
    const player = await db.user.create({
      data: { phoneNumber: "+353830000099", firstName: "Milo", lastInitial: "Z" },
    });
    await callerAs(player.id, player.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

    // Walk-ins can still be added past max.
    await organizerCaller.rsvps.addWalkIn({ eventId: event.id, name: "Extra Eli", paymentStatus: "PAID_OUTSIDE_APP" });
    await organizerCaller.rsvps.addWalkIn({ eventId: event.id, name: "Extra Fin", paymentStatus: "OWES" });

    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
    expect(view.rsvps.filter((r) => r.status === "GOING")).toHaveLength(3);
  });
  it("undoes marking a payment as paid, restoring what it was", async () => {
    const { organizerCaller, event, rsvp } = await setup();
    await organizerCaller.events.confirm({ eventId: event.id });

    await organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id });
    const restored = await organizerCaller.rsvps.undoMarkPaidOutsideApp({ rsvpId: rsvp.id, restoreTo: "PENDING" });

    expect(restored.paymentStatus).toBe("PENDING");
  });

  it("refuses to undo a payment that isn't marked as paid outside the app", async () => {
    const { organizerCaller, rsvp } = await setup();

    await expect(
      organizerCaller.rsvps.undoMarkPaidOutsideApp({ rsvpId: rsvp.id, restoreTo: "PENDING" }),
    ).rejects.toThrow("isn't marked as paid");
  });

  it("rejects a non-organizer undoing a paid mark", async () => {
    const { organizerCaller, event, rsvp, playerCaller } = await setup();
    await organizerCaller.events.confirm({ eventId: event.id });
    await organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id });

    await expect(
      playerCaller.rsvps.undoMarkPaidOutsideApp({ rsvpId: rsvp.id, restoreTo: "PENDING" }),
    ).rejects.toThrow("Only the group's organizer");
  });

  it("tells the organizer what they can do now: phase, event actions and per-person actions", async () => {
    const { organizerCaller, event, rsvp } = await setup();

    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });

    // The game is tomorrow and unconfirmed: nothing charged, nothing played.
    expect(view.eventActions.phase).toBe("OPEN");
    expect(view.eventActions.primary).toBe("SHARE");
    expect(view.rsvps.find((r) => r.id === rsvp.id)?.actions).toEqual(["MARK_DROPPED_OUT"]);
  });

  it("stops offering Remove once the event is confirmed and offers Mark paid instead", async () => {
    const { organizerCaller, event, rsvp } = await setup();

    await organizerCaller.events.confirm({ eventId: event.id });
    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });

    expect(view.eventActions.phase).toBe("CONFIRMED");
    expect(view.rsvps.find((r) => r.id === rsvp.id)?.actions).toEqual(["MARK_PAID", "MARK_DROPPED_OUT"]);
  });

  it("refuses attendance marks before the game starts", async () => {
    const { organizerCaller, rsvp } = await setup();

    await expect(organizerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: false })).rejects.toThrow(
      "isn't possible at this stage",
    );
  });

  it("refuses marking paid before the game is confirmed", async () => {
    const { organizerCaller, rsvp } = await setup();

    await expect(organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id })).rejects.toThrow(
      "isn't possible at this stage",
    );
  });

  it("refuses removing a player once the game has started", async () => {
    const { organizerCaller, event, rsvp } = await setup();
    await organizerCaller.events.confirm({ eventId: event.id });
    await startGame(event.id);

    await expect(organizerCaller.rsvps.markDroppedOut({ rsvpId: rsvp.id })).rejects.toThrow("isn't possible at this stage");
  });

  it("refuses marking the organizer's own rsvp a no-show", async () => {
    const { organizer, organizerCaller, event } = await setup();
    const own = await organizerCaller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    void organizer;
    await organizerCaller.events.confirm({ eventId: event.id });
    await startGame(event.id);

    await expect(organizerCaller.rsvps.markAttendance({ rsvpId: own.id, attended: false })).rejects.toThrow(
      "isn't possible at this stage",
    );
  });

  it("allows undoing a no-show while the game is running", async () => {
    const { organizerCaller, event, rsvp } = await setup();
    await organizerCaller.events.confirm({ eventId: event.id });
    await startGame(event.id);

    await organizerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: false });
    const undone = await organizerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: null });
    expect(undone.attended).toBeNull();
  });
});
