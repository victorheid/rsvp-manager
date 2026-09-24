import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PricingMode } from "@/generated/prisma/enums";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { fakePushSender } from "@/server/integrations/push/fake";
import { fakeSmsSender } from "@/server/integrations/sms/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("notification triggers (§9)", () => {
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
    fakePushSender.reset();
    fakeSmsSender.reset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  /** A user with one subscribed device whose endpoint is `https://push.example/<name>`. */
  async function makeUser(name: string, phoneNumber: string) {
    const user = await db.user.create({
      data: { phoneNumber, name: name, email: `${phoneNumber}@example.test`, emailVerifiedAt: new Date() },
    });
    await db.pushSubscription.create({
      data: { userId: user.id, endpoint: `https://push.example/${name}`, p256dh: "k", auth: "a" },
    });
    return { user, caller: callerAs(user.id, phoneNumber) };
  }

  const notified = () => fakePushSender.sent.map((entry) => entry.endpoint.replace("https://push.example/", "")).sort();

  async function setup(maxPlayers?: number, waitlistMode: "IN_ORDER" | "FIRST_TO_CLAIM" = "IN_ORDER") {
    const organizer = await makeUser("org", "+353830000001");
    const group = await organizer.caller.groups.create({ name: "Friday Futsal" });
    const member = await makeUser("member", "+353830000002");
    await member.caller.groups.join({ slug: group.slug, token: group.inviteToken ?? "" });
    fakePushSender.reset();

    const startsAt = new Date(Date.now() + 86_400_000);
    const eventInput = {
      groupId: group.id,
      title: "Friday game",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3_600_000),
      location: "Court 1",
      cutoffAt: new Date(Date.now() + 3_600_000),
      maxPlayers,
      totalCostCents: 800,
      pricingMode: PricingMode.FIXED_PER_HEAD, openToNonMembers: true,
      cashAllowed: true,
      waitlistMode,
    };
    const event = await organizer.caller.events.create(eventInput);

    return { organizer, group, member, event, eventInput };
  }

  it("tells group members (not the organizer) when a game is posted", async () => {
    const { event } = await setup();

    expect(notified()).toEqual(["member"]);
    expect(fakePushSender.sent[0]?.message).toMatchObject({ title: "Friday Futsal: new game", url: `/e/${event.slug}` });
  });

  it("tells everyone in — but not the organizer who did it — when the game is confirmed", async () => {
    const { organizer, member, event } = await setup();
    await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await organizer.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    fakePushSender.reset();

    await organizer.caller.events.confirm({ eventId: event.id });

    expect(notified()).toEqual(["member"]);
    expect(fakePushSender.sent[0]?.message.title).toBe("Game confirmed");
  });

  it("tells people going and waitlisted when the game is cancelled", async () => {
    const { organizer, member, event } = await setup(1);
    const waiter = await makeUser("waiter", "+353830000003");
    await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await waiter.caller.waitlist.join({ eventId: event.id });
    fakePushSender.reset();

    await organizer.caller.events.cancel({ eventId: event.id });

    expect(notified()).toEqual(["member", "waiter"]);
  });

  it("tells people when the time changes, but not for a description-only edit", async () => {
    const { organizer, member, event, eventInput } = await setup();
    await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    fakePushSender.reset();

    await organizer.caller.events.edit({ ...eventInput, eventId: event.id, description: "Bring a bib" });
    expect(notified()).toEqual([]);

    await organizer.caller.events.edit({ ...eventInput, eventId: event.id, location: "Court 2" });
    expect(notified()).toEqual(["member"]);
  });

  it("tells a player when the organizer marks them dropped out", async () => {
    const { organizer, member, event } = await setup();
    const rsvp = await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    fakePushSender.reset();

    await organizer.caller.rsvps.markDroppedOut({ rsvpId: rsvp.id });

    expect(notified()).toEqual(["member"]);
    expect(fakePushSender.sent[0]?.message.title).toBe("You've been marked as dropped out");
  });

  it("in order: tells only the next person that a spot is held for them — by drop-out or by the organizer", async () => {
    const { organizer, member, event } = await setup(1);
    const next = await makeUser("next", "+353830000003");
    const later = await makeUser("later", "+353830000004");
    const rsvp = await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await next.caller.waitlist.join({ eventId: event.id });
    await later.caller.waitlist.join({ eventId: event.id });
    fakePushSender.reset();

    await organizer.caller.rsvps.markDroppedOut({ rsvpId: rsvp.id });

    expect(notified()).toEqual(["member", "next"]);
    expect(fakePushSender.sent.find((entry) => entry.endpoint.endsWith("/next"))?.message.title).toBe("A spot is yours");
  });

  it("first to claim: tells everyone waiting when a full game loses a player", async () => {
    const { member, event } = await setup(1, "FIRST_TO_CLAIM");
    const waiter = await makeUser("waiter", "+353830000003");
    await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await waiter.caller.waitlist.join({ eventId: event.id });
    fakePushSender.reset();

    await member.caller.rsvps.drop({ eventId: event.id });

    expect(notified()).toEqual(["waiter"]);
    expect(fakePushSender.sent[0]?.message.title).toBe("A spot opened up");
  });

  it("doesn't tell the waitlist when the game still had room", async () => {
    const { member, event } = await setup(5);
    const other = await makeUser("other", "+353830000003");
    await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    await other.caller.waitlist.join({ eventId: event.id }).catch(() => undefined); // not full: can't join
    fakePushSender.reset();

    await member.caller.rsvps.drop({ eventId: event.id });

    expect(notified()).toEqual([]);
  });

  it("still succeeds when the push service is broken", async () => {
    const { organizer, member, event } = await setup();
    await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
    const original = fakePushSender.send.bind(fakePushSender);
    fakePushSender.send = async () => {
      throw new Error("push service down");
    };

    try {
      const confirmed = await organizer.caller.events.confirm({ eventId: event.id });
      expect(confirmed.event.status).toBe("CONFIRMED");
    } finally {
      fakePushSender.send = original;
    }
  });

  describe("SMS fallback", () => {
    it("texts money-related messages (confirmed, cancelled), even to people without push", async () => {
      const { organizer, event } = await setup();
      const noPush = await db.user.create({ data: { phoneNumber: "+353830000009", name: "Nop" } });
      await callerAs(noPush.id, noPush.phoneNumber).rsvps.create({ eventId: event.id, paymentMethod: "CASH" });
      fakeSmsSender.reset();

      await organizer.caller.events.confirm({ eventId: event.id });
      expect(fakeSmsSender.lastMessageTo("+353830000009")?.body).toContain("Game confirmed");

      fakeSmsSender.reset();
      await organizer.caller.events.cancel({ eventId: event.id });
      expect(fakeSmsSender.lastMessageTo("+353830000009")?.body).toContain("Game cancelled");
    });

    it("doesn't text anything else", async () => {
      const { organizer, member, event, eventInput } = await setup();
      const rsvp = await member.caller.rsvps.create({ eventId: event.id, paymentMethod: "CASH" });

      await organizer.caller.events.edit({ ...eventInput, eventId: event.id, location: "Court 2" });
      await organizer.caller.rsvps.markDroppedOut({ rsvpId: rsvp.id });

      expect(fakeSmsSender.sentMessages).toEqual([]);
    });
  });
});
