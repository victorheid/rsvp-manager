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
      data: { phoneNumber: "+353830000001", firstName: "Org", lastInitial: "O" },
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

    const updated = await organizerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: false });
    expect(updated.attended).toBe(false);

    const view = await organizerCaller.rsvps.forOrganizer({ eventId: event.id });
    expect(view.rsvps[0]?.noShowCount).toBe(1);
  });

  it("marks a cash rsvp as paid outside app, but not twice", async () => {
    const { organizerCaller, rsvp } = await setup();

    const updated = await organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id });
    expect(updated.paymentStatus).toBe("PAID_OUTSIDE_APP");

    await expect(organizerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id })).rejects.toThrow("Already");
  });

  it("lets the organizer remove a player, freeing their spot", async () => {
    const { organizerCaller, rsvp } = await setup();

    const removed = await organizerCaller.rsvps.remove({ rsvpId: rsvp.id });
    expect(removed.status).toBe("CANCELLED");

    await expect(organizerCaller.rsvps.remove({ rsvpId: rsvp.id })).rejects.toThrow("Already dropped out");
  });

  it("rejects attendance/payment/remove actions from a non-organizer", async () => {
    const { rsvp, playerCaller } = await setup();

    await expect(
      playerCaller.rsvps.markAttendance({ rsvpId: rsvp.id, attended: true }),
    ).rejects.toThrow("Only the group's organizer");
    await expect(playerCaller.rsvps.markPaidOutsideApp({ rsvpId: rsvp.id })).rejects.toThrow(
      "Only the group's organizer",
    );
    await expect(playerCaller.rsvps.remove({ rsvpId: rsvp.id })).rejects.toThrow(
      "Only the group's organizer",
    );
  });
});
