import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { resetDatabase } from "@/server/testing/resetDatabase";
import { getGroupsForUser } from "./getGroupsForUser";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("getGroupsForUser", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it("returns only the groups the user is a member of", async () => {
    const user = await db.user.create({
      data: { phoneNumber: "+353840000010", name: "Ana" },
    });
    const stranger = await db.user.create({
      data: { phoneNumber: "+353840000011", name: "Bo" },
    });

    const memberGroup = await db.group.create({
      data: { slug: "member-group", name: "Member Group", organizerId: stranger.id },
    });
    await db.group.create({ data: { slug: "other-group", name: "Other Group", organizerId: stranger.id } });
    await db.groupMembership.create({ data: { groupId: memberGroup.id, userId: user.id } });

    const groups = await getGroupsForUser(db, user.id);

    expect(groups.map((g) => g.slug)).toEqual(["member-group"]);
  });
});
