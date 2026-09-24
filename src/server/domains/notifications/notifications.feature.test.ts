import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { fakePushSender } from "@/server/integrations/push/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("push notifications", () => {
  function callerAs(userId: string, phoneNumber: string) {
    return appRouter.createCaller({
      db,
      user: { id: userId, phoneNumber },
      setSession: () => {},
      clearSession: () => {},
    });
  }

  const subscription = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: "p256dh-key", auth: "auth-key" },
  });

  beforeEach(async () => {
    await resetDatabase();
    fakePushSender.reset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function makeUser(phoneNumber: string) {
    const user = await db.user.create({ data: { phoneNumber, name: "Ann" } });
    return { user, caller: callerAs(user.id, user.phoneNumber) };
  }

  it("stores a subscription and delivers the test notification to it", async () => {
    const { caller } = await makeUser("+353830000001");

    await caller.notifications.subscribePush({ subscription: subscription("https://push.example/a") });
    await caller.notifications.sendTest();

    expect(fakePushSender.sent.map((entry) => entry.endpoint)).toEqual(["https://push.example/a"]);
  });

  it("keeps one row per device, handing it to whoever subscribed last", async () => {
    const first = await makeUser("+353830000001");
    const second = await makeUser("+353830000002");

    await first.caller.notifications.subscribePush({ subscription: subscription("https://push.example/shared") });
    await second.caller.notifications.subscribePush({ subscription: subscription("https://push.example/shared") });

    const rows = await db.pushSubscription.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(second.user.id);
  });

  it("only removes the caller's own subscription", async () => {
    const owner = await makeUser("+353830000001");
    const other = await makeUser("+353830000002");
    await owner.caller.notifications.subscribePush({ subscription: subscription("https://push.example/a") });

    await other.caller.notifications.unsubscribePush({ endpoint: "https://push.example/a" });
    expect(await db.pushSubscription.count()).toBe(1);

    await owner.caller.notifications.unsubscribePush({ endpoint: "https://push.example/a" });
    expect(await db.pushSubscription.count()).toBe(0);
  });

  it("deletes subscriptions the push service reports as gone", async () => {
    const { caller } = await makeUser("+353830000001");
    await caller.notifications.subscribePush({ subscription: subscription("https://push.example/dead") });
    await caller.notifications.subscribePush({ subscription: subscription("https://push.example/live") });
    fakePushSender.goneEndpoints.add("https://push.example/dead");

    await caller.notifications.sendTest();

    expect(fakePushSender.sent.map((entry) => entry.endpoint)).toEqual(["https://push.example/live"]);
    expect((await db.pushSubscription.findMany()).map((row) => row.endpoint)).toEqual(["https://push.example/live"]);
  });

  it("rejects a malformed subscription", async () => {
    const { caller } = await makeUser("+353830000001");

    await expect(
      caller.notifications.subscribePush({ subscription: { endpoint: "not-a-url", keys: { p256dh: "", auth: "" } } }),
    ).rejects.toThrow();
  });

  it("requires sign-in", async () => {
    const anonymous = appRouter.createCaller({ db, user: null, setSession: () => {}, clearSession: () => {} });

    await expect(anonymous.notifications.sendTest()).rejects.toThrow("UNAUTHORIZED");
  });
});
