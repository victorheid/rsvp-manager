import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";

/**
 * Feature test: exercises the groups domain through the tRPC caller
 * against a real Postgres test DB (CLAUDE.md — no mocked Prisma). Skips
 * itself without a test DB, same as confirmEvent.test.ts.
 */
const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("groups", () => {
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

  it("suffixes the slug on a name collision instead of failing", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353870000001", email: "+353870000001@example.test", emailVerifiedAt: new Date(), firstName: "Ana", lastInitial: "O" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);

    const first = await caller.groups.create({ name: "Thursday Basketball" });
    const second = await caller.groups.create({ name: "Thursday Basketball" });
    const third = await caller.groups.create({ name: "Thursday Basketball" });

    expect(first.slug).toBe("thursday-basketball");
    expect(second.slug).toBe("thursday-basketball-2");
    expect(third.slug).toBe("thursday-basketball-3");
  });

  it("makes the organizer a member on create, and reports member count + membership on getBySlug", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353870000002", email: "+353870000002@example.test", emailVerifiedAt: new Date(), firstName: "Ben", lastInitial: "L" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await caller.groups.create({ name: "Tuesday Padel" });

    const viewed = await caller.groups.getBySlug({ slug: group.slug });
    expect(viewed.memberCount).toBe(1);
    expect(viewed.isMember).toBe(true);
  });

  it("lets another user join via the group link, idempotently", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353870000003", email: "+353870000003@example.test", emailVerifiedAt: new Date(), firstName: "Cy", lastInitial: "K" },
    });
    const player = await db.user.create({
      data: { phoneNumber: "+353870000004", firstName: "Dee", lastInitial: "P" },
    });

    const organizerCaller = callerAs(organizer.id, organizer.phoneNumber);
    const playerCaller = callerAs(player.id, player.phoneNumber);

    const group = await organizerCaller.groups.create({ name: "Sunday Football" });

    const asAnonymous = await playerCaller.groups.getBySlug({ slug: group.slug });
    expect(asAnonymous.isMember).toBe(false);

    await playerCaller.groups.join({ slug: group.slug });
    await playerCaller.groups.join({ slug: group.slug }); // idempotent

    const membershipCount = await db.groupMembership.count({ where: { groupId: group.id } });
    expect(membershipCount).toBe(2); // organizer + player, not double-counted

    const asMember = await playerCaller.groups.getBySlug({ slug: group.slug });
    expect(asMember.isMember).toBe(true);
    expect(asMember.memberCount).toBe(2);
  });

  it("rejects joining a group that doesn't exist", async () => {
    const player = await db.user.create({
      data: { phoneNumber: "+353870000005", firstName: "Eve", lastInitial: "Q" },
    });
    const caller = callerAs(player.id, player.phoneNumber);

    await expect(caller.groups.join({ slug: "no-such-group" })).rejects.toThrow();
  });

  it("lets the organizer edit the group's name and description, but not its slug", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353870000006", email: "+353870000006@example.test", emailVerifiedAt: new Date(), firstName: "Fay", lastInitial: "R" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await caller.groups.create({ name: "Old Name" });

    const edited = await caller.groups.edit({ groupId: group.id, name: "New Name", description: "New description" });

    expect(edited.name).toBe("New Name");
    expect(edited.description).toBe("New description");
    expect(edited.slug).toBe(group.slug);
  });

  it("rejects a non-organizer editing the group", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353870000007", email: "+353870000007@example.test", emailVerifiedAt: new Date(), firstName: "Gia", lastInitial: "S" },
    });
    const impostor = await db.user.create({
      data: { phoneNumber: "+353870000008", firstName: "Hal", lastInitial: "T" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await caller.groups.create({ name: "Guarded Group" });

    await expect(
      callerAs(impostor.id, impostor.phoneNumber).groups.edit({ groupId: group.id, name: "Hijacked" }),
    ).rejects.toThrow("Only the group's organizer");
  });
});
