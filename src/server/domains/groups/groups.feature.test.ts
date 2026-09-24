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
      data: { phoneNumber: "+353870000001", email: "+353870000001@example.test", emailVerifiedAt: new Date(), name: "Ana" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);

    const first = await caller.groups.create({ name: "Thursday Basketball" });
    const second = await caller.groups.create({ name: "Thursday Basketball" });
    const third = await caller.groups.create({ name: "Thursday Basketball" });

    expect(first.slug).toBe("thursday-basketball");
    expect(second.slug).toBe("thursday-basketball-2");
    expect(third.slug).toBe("thursday-basketball-3");
  });

  async function makeOrganizer(phoneNumber: string) {
    const user = await db.user.create({
      data: { phoneNumber, email: `${phoneNumber}@example.test`, emailVerifiedAt: new Date(), name: "Org" },
    });
    return { user, caller: callerAs(user.id, phoneNumber) };
  }

  async function makePlayer(phoneNumber: string, name = "Player") {
    const user = await db.user.create({ data: { phoneNumber, name } });
    return { user, caller: callerAs(user.id, phoneNumber) };
  }

  function inviteToken(group: { inviteToken: string | null }): string {
    if (!group.inviteToken) throw new Error("group has no invite link");
    return group.inviteToken;
  }

  it("makes the organizer a member on create, with an open invite link only they can see", async () => {
    const organizer = await makeOrganizer("+353870000002");
    const group = await organizer.caller.groups.create({ name: "Tuesday Padel" });

    const viewed = await organizer.caller.groups.getBySlug({ slug: group.slug });
    expect(viewed).toMatchObject({ access: "MEMBER", memberCount: 1, isOrganizer: true, canLeave: false });
    expect(viewed.access === "MEMBER" && viewed.invite).toEqual({ token: group.inviteToken, expiresAt: null, state: "OPEN" });
  });

  it("shows outsiders only the group's name and organizer", async () => {
    const organizer = await makeOrganizer("+353870000003");
    const outsider = await makePlayer("+353870000004");
    const group = await organizer.caller.groups.create({ name: "Sunday Football", description: "Secret pitch" });

    const view = await outsider.caller.groups.getBySlug({ slug: group.slug });
    expect(view).toEqual({ access: "OUTSIDER", id: group.id, slug: group.slug, name: "Sunday Football", organizerName: "Org" });
    await expect(outsider.caller.groups.members({ slug: group.slug })).rejects.toThrow("Only members");
  });

  it("lets someone join with the invite link, idempotently, and hides the link from members", async () => {
    const organizer = await makeOrganizer("+353870000005");
    const player = await makePlayer("+353870000006");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    const token = inviteToken(group);

    expect(await player.caller.groups.invite({ slug: group.slug, token })).toMatchObject({ status: "VALID", isMember: false, memberCount: 1 });

    await player.caller.groups.join({ slug: group.slug, token });
    await player.caller.groups.join({ slug: group.slug, token }); // idempotent

    expect(await db.groupMembership.count({ where: { groupId: group.id } })).toBe(2);
    const asMember = await player.caller.groups.getBySlug({ slug: group.slug });
    expect(asMember).toMatchObject({ access: "MEMBER", memberCount: 2, isOrganizer: false, canLeave: true, invite: null });
    expect(JSON.stringify(await player.caller.groups.mine())).not.toContain(token);
  });

  it("refuses the group link without a token, a wrong token and a missing group", async () => {
    const organizer = await makeOrganizer("+353870000007");
    const player = await makePlayer("+353870000008");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });

    await expect(player.caller.groups.join({ slug: group.slug, token: "guess" })).rejects.toThrow("no longer works");
    await expect(player.caller.groups.join({ slug: "no-such-group", token: "guess" })).rejects.toThrow("Group not found");
    expect(await player.caller.groups.invite({ slug: group.slug, token: "guess" })).toMatchObject({
      status: "INVALID",
      name: "Sunday Football",
      description: null,
      memberCount: null,
    });
  });

  it("kills the old link on reset, and expires links on time", async () => {
    const organizer = await makeOrganizer("+353870000009");
    const early = await makePlayer("+353870000010");
    const late = await makePlayer("+353870000011");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    const oldToken = inviteToken(group);

    await organizer.caller.groups.updateInvite({ groupId: group.id, expiry: "never", reset: true });
    await expect(early.caller.groups.join({ slug: group.slug, token: oldToken })).rejects.toThrow("no longer works");

    const reset = await db.group.findUniqueOrThrow({ where: { id: group.id } });
    const newToken = inviteToken(reset);
    expect(newToken).not.toBe(oldToken);
    await early.caller.groups.join({ slug: group.slug, token: newToken });

    // Changing only the expiry keeps the same link.
    await organizer.caller.groups.updateInvite({ groupId: group.id, expiry: "24h", reset: false });
    const withExpiry = await db.group.findUniqueOrThrow({ where: { id: group.id } });
    expect(withExpiry.inviteToken).toBe(newToken);
    expect(withExpiry.inviteExpiresAt).not.toBeNull();

    await db.group.update({ where: { id: group.id }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    await expect(late.caller.groups.join({ slug: group.slug, token: newToken })).rejects.toThrow("expired");
    expect(await late.caller.groups.invite({ slug: group.slug, token: newToken })).toMatchObject({ status: "EXPIRED" });
    // Already a member: still let through.
    await expect(early.caller.groups.join({ slug: group.slug, token: newToken })).resolves.toBeTruthy();
  });

  it("stops invites, and turns them back on with a new link", async () => {
    const organizer = await makeOrganizer("+353870000012");
    const player = await makePlayer("+353870000013");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    const token = inviteToken(group);

    await organizer.caller.groups.stopInvite({ groupId: group.id });
    await expect(player.caller.groups.join({ slug: group.slug, token })).rejects.toThrow("no longer works");
    const stopped = await organizer.caller.groups.getBySlug({ slug: group.slug });
    expect(stopped.access === "MEMBER" && stopped.invite?.state).toBe("STOPPED");

    await organizer.caller.groups.updateInvite({ groupId: group.id, expiry: "7d", reset: false });
    const reopened = await db.group.findUniqueOrThrow({ where: { id: group.id } });
    await player.caller.groups.join({ slug: group.slug, token: inviteToken(reopened) });
    expect(inviteToken(reopened)).not.toBe(token);
  });

  it("only lets the organizer manage the invite link", async () => {
    const organizer = await makeOrganizer("+353870000014");
    const player = await makePlayer("+353870000015");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    await player.caller.groups.join({ slug: group.slug, token: inviteToken(group) });

    await expect(player.caller.groups.updateInvite({ groupId: group.id, expiry: "never", reset: true })).rejects.toThrow("Only the group's organizer");
    await expect(player.caller.groups.stopInvite({ groupId: group.id })).rejects.toThrow("Only the group's organizer");
  });

  it("lists members, with phone numbers and actions only for the organizer", async () => {
    const organizer = await makeOrganizer("+353870000016");
    const player = await makePlayer("+353870000017", "Dee");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    await player.caller.groups.join({ slug: group.slug, token: inviteToken(group) });

    const asOrganizer = await organizer.caller.groups.members({ slug: group.slug });
    expect(asOrganizer.members.map(({ name, isOrganizer, phoneNumber, actions }) => ({ name, isOrganizer, phoneNumber, actions }))).toEqual([
      { name: "Org", isOrganizer: true, phoneNumber: "+353870000016", actions: [] },
      { name: "Dee", isOrganizer: false, phoneNumber: "+353870000017", actions: ["REMOVE"] },
    ]);

    const asPlayer = await player.caller.groups.members({ slug: group.slug });
    expect(asPlayer.members.map(({ phoneNumber, actions }) => ({ phoneNumber, actions }))).toEqual([
      { phoneNumber: null, actions: [] },
      { phoneNumber: null, actions: [] },
    ]);
  });

  it("lets the organizer remove a member, but not themselves, and nobody else remove anyone", async () => {
    const organizer = await makeOrganizer("+353870000018");
    const player = await makePlayer("+353870000019");
    const other = await makePlayer("+353870000020");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    await player.caller.groups.join({ slug: group.slug, token: inviteToken(group) });
    await other.caller.groups.join({ slug: group.slug, token: inviteToken(group) });

    await expect(player.caller.groups.removeMember({ groupId: group.id, memberUserId: other.user.id })).rejects.toThrow("Only the group's organizer");
    await expect(organizer.caller.groups.removeMember({ groupId: group.id, memberUserId: organizer.user.id })).rejects.toThrow();

    await organizer.caller.groups.removeMember({ groupId: group.id, memberUserId: player.user.id });
    expect(await player.caller.groups.getBySlug({ slug: group.slug })).toMatchObject({ access: "OUTSIDER" });
    expect(await db.groupMembership.count({ where: { groupId: group.id } })).toBe(2);
  });

  it("lets a member leave, but not the organizer", async () => {
    const organizer = await makeOrganizer("+353870000021");
    const player = await makePlayer("+353870000022");
    const group = await organizer.caller.groups.create({ name: "Sunday Football" });
    await player.caller.groups.join({ slug: group.slug, token: inviteToken(group) });

    await player.caller.groups.leave({ groupId: group.id });
    expect(await player.caller.groups.getBySlug({ slug: group.slug })).toMatchObject({ access: "OUTSIDER" });
    await expect(player.caller.groups.leave({ groupId: group.id })).rejects.toThrow("not a member");
    await expect(organizer.caller.groups.leave({ groupId: group.id })).rejects.toThrow("can't leave");
  });

  it("lets the organizer edit the group's name and description, but not its slug", async () => {
    const organizer = await db.user.create({
      data: { phoneNumber: "+353870000006", email: "+353870000006@example.test", emailVerifiedAt: new Date(), name: "Fay" },
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
      data: { phoneNumber: "+353870000007", email: "+353870000007@example.test", emailVerifiedAt: new Date(), name: "Gia" },
    });
    const impostor = await db.user.create({
      data: { phoneNumber: "+353870000008", name: "Hal" },
    });
    const caller = callerAs(organizer.id, organizer.phoneNumber);
    const group = await caller.groups.create({ name: "Guarded Group" });

    await expect(
      callerAs(impostor.id, impostor.phoneNumber).groups.edit({ groupId: group.id, name: "Hijacked" }),
    ).rejects.toThrow("Only the group's organizer");
  });
});
