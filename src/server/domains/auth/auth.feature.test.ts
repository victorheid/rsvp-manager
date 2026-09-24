import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "@/server/router";
import { db } from "@/server/db";
import { fakeSmsSender } from "@/server/integrations/sms/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";

/**
 * Feature test: exercises the phone + SMS code flow end to end through the
 * tRPC caller against a real Postgres test DB (CLAUDE.md — no mocked
 * Prisma). Only the SMS send is faked (CLAUDE.md — mock external
 * integrations only). Skips itself without a test DB, same as
 * confirmEvent.test.ts.
 */
const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("auth: phone + SMS code", () => {
  let cookie: string | undefined;

  const caller = appRouter.createCaller({
    db,
    user: null,
    setSession: (userId: string) => {
      cookie = `rsvp_session=signed-in-as-${userId}`;
    },
    clearSession: () => {
      cookie = undefined;
    },
  });

  beforeEach(async () => {
    await resetDatabase();
    fakeSmsSender.reset();
    cookie = undefined;
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  function sentCode(phoneNumber: string): string {
    const message = fakeSmsSender.lastMessageTo(phoneNumber);
    if (!message) {
      throw new Error(`No SMS sent to ${phoneNumber}`);
    }
    const match = /\d{6}/.exec(message.body);
    if (!match) {
      throw new Error(`No 6-digit code found in "${message.body}"`);
    }
    return match[0];
  }

  it("asks for a name on first sign-in, then signs the user in", async () => {
    const phoneNumber = "+353871112222";
    await caller.auth.requestCode({ phoneNumber });
    const code = sentCode(phoneNumber);

    const withoutName = await caller.auth.verifyCode({ phoneNumber, code });
    expect(withoutName).toEqual({ status: "needs_name" });
    expect(cookie).toBeUndefined();

    const withName = await caller.auth.verifyCode({
      phoneNumber,
      code,
      name: "Ana",
    });

    expect(withName.status).toBe("verified");
    expect(cookie).toContain("signed-in-as-");

    const user = await db.user.findUniqueOrThrow({ where: { phoneNumber } });
    expect(user.name).toBe("Ana");
  });

  it("signs a returning user in without asking for a name again", async () => {
    const phoneNumber = "+353873334444";
    const existing = await db.user.create({
      data: { phoneNumber, name: "Ben" },
    });

    await caller.auth.requestCode({ phoneNumber });
    const code = sentCode(phoneNumber);

    const result = await caller.auth.verifyCode({ phoneNumber, code });

    expect(result).toEqual({ status: "verified", userId: existing.id });
  });

  it("rejects an incorrect code", async () => {
    const phoneNumber = "+353875556666";
    await caller.auth.requestCode({ phoneNumber });

    await expect(
      caller.auth.verifyCode({ phoneNumber, code: "000000" }),
    ).rejects.toThrow("Incorrect code");
  });

  it("only accepts the most recently requested code", async () => {
    const phoneNumber = "+353877778888";
    await caller.auth.requestCode({ phoneNumber });
    const firstCode = sentCode(phoneNumber);

    await caller.auth.requestCode({ phoneNumber });
    const secondCode = sentCode(phoneNumber);
    expect(secondCode).not.toBe(firstCode);

    await expect(
      caller.auth.verifyCode({ phoneNumber, code: firstCode, name: "Cy" }),
    ).rejects.toThrow();

    const result = await caller.auth.verifyCode({
      phoneNumber,
      code: secondCode,
      name: "Cy",
    });
    expect(result.status).toBe("verified");
  });
});
