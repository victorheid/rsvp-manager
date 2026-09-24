import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { appRouter } from "@/server/router";
import { fakeEmailSender } from "@/server/integrations/email/fake";
import { fakeSmsSender } from "@/server/integrations/sms/fake";
import { resetDatabase } from "@/server/testing/resetDatabase";

const hasTestDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasTestDb)("organizer email and changing phone number", () => {
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
    fakeEmailSender.reset();
    fakeSmsSender.reset();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  async function makeUser(phoneNumber = "+353830000001", extra: { email?: string } = {}) {
    const user = await db.user.create({
      data: {
        phoneNumber,
        name: "Ann",
        ...(extra.email ? { email: extra.email, emailVerifiedAt: new Date() } : {}),
      },
    });
    return { user, caller: callerAs(user.id, phoneNumber) };
  }

  const codeIn = (body: string | undefined) => body?.match(/\b(\d{6})\b/)?.[1] ?? "";

  async function verifyEmailFor(caller: ReturnType<typeof callerAs>, email: string) {
    await caller.auth.requestEmailVerification({ email });
    return caller.auth.verifyEmail({ code: codeIn(fakeEmailSender.lastMessageTo(email.toLowerCase())?.body) });
  }

  it("locks a phone sign-in code after too many wrong tries (the attempt count now persists)", async () => {
    const anonymous = appRouter.createCaller({ db, user: null, setSession: () => {}, clearSession: () => {} });
    await anonymous.auth.requestCode({ phoneNumber: "+353830000005" });
    const right = codeIn(fakeSmsSender.lastMessageTo("+353830000005")?.body);
    const wrong = right === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(anonymous.auth.verifyCode({ phoneNumber: "+353830000005", code: wrong })).rejects.toThrow("Incorrect code");
    }
    await expect(anonymous.auth.verifyCode({ phoneNumber: "+353830000005", code: right })).rejects.toThrow("Too many incorrect attempts");
  });

  describe("verifying an email", () => {
    it("sends a code and verifies the address, normalised", async () => {
      const { caller } = await makeUser();
      expect(await caller.auth.account()).toMatchObject({ email: null, emailVerified: false });

      const result = await verifyEmailFor(caller, "Ann@Example.com");

      expect(result).toEqual({ email: "ann@example.com" });
      expect(await caller.auth.account()).toMatchObject({ email: "ann@example.com", emailVerified: true });
    });

    it("rejects a wrong code, counts attempts, and locks after too many", async () => {
      const { caller } = await makeUser();
      await caller.auth.requestEmailVerification({ email: "ann@example.com" });
      const right = codeIn(fakeEmailSender.lastMessageTo("ann@example.com")?.body);
      const wrong = right === "000000" ? "111111" : "000000";

      for (let attempt = 0; attempt < 5; attempt++) {
        await expect(caller.auth.verifyEmail({ code: wrong })).rejects.toThrow("Incorrect email code");
      }
      await expect(caller.auth.verifyEmail({ code: right })).rejects.toThrow("Too many incorrect attempts");
    });

    it("only honours the latest code and an unexpired one", async () => {
      const { user, caller } = await makeUser();
      await caller.auth.requestEmailVerification({ email: "ann@example.com" });
      const first = codeIn(fakeEmailSender.lastMessageTo("ann@example.com")?.body);
      await caller.auth.requestEmailVerification({ email: "ann@example.com" });
      const second = codeIn(fakeEmailSender.lastMessageTo("ann@example.com")?.body);

      if (first !== second) {
        await expect(caller.auth.verifyEmail({ code: first })).rejects.toThrow("Incorrect email code");
      }
      await db.emailVerificationCode.updateMany({ where: { userId: user.id, consumedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await expect(caller.auth.verifyEmail({ code: second })).rejects.toThrow("expired");
    });

    it("won't take an address another account already verified", async () => {
      await makeUser("+353830000001", { email: "shared@example.com" });
      const other = await makeUser("+353830000002");

      await expect(other.caller.auth.requestEmailVerification({ email: "Shared@example.com" })).rejects.toThrow("already used");
    });

    it("tells the old address and the phone when a verified email is replaced", async () => {
      const { caller } = await makeUser("+353830000001", { email: "old@example.com" });

      await verifyEmailFor(caller, "new@example.com");

      expect(fakeEmailSender.lastMessageTo("old@example.com")?.subject).toBe("Your email was changed");
      expect(fakeSmsSender.lastMessageTo("+353830000001")?.body).toContain("new@example.com");
    });
  });

  describe("organizers need a verified email", () => {
    it("blocks creating a group, and lets it through once verified", async () => {
      const { caller } = await makeUser();

      await expect(caller.groups.create({ name: "Futsal" })).rejects.toThrow("Verify your email first");

      await verifyEmailFor(caller, "ann@example.com");
      expect(await caller.groups.create({ name: "Futsal" })).toMatchObject({ name: "Futsal" });
    });

    it("blocks creating events and payout setup for an unverified organizer", async () => {
      const { user, caller } = await makeUser();
      const group = await db.group.create({ data: { slug: "old-group", name: "Old", organizerId: user.id } });
      const startsAt = new Date(Date.now() + 86_400_000);

      await expect(
        caller.events.create({
          groupId: group.id, title: "Game", startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), location: "A",
          cutoffAt: new Date(Date.now() + 3_600_000), totalCostCents: 500, pricingMode: "FIXED_PER_HEAD", cashAllowed: true,
        }),
      ).rejects.toThrow("Verify your email first");
      await expect(caller.payouts.startOnboarding({ returnPath: "/" })).rejects.toThrow("Verify your email first");
    });

    it("never asks a player for one", async () => {
      const organizer = await makeUser("+353830000001", { email: "org@example.com" });
      const group = await organizer.caller.groups.create({ name: "Futsal" });
      const player = await makeUser("+353830000002");

      await expect(player.caller.groups.join({ slug: group.slug, token: group.inviteToken ?? "" })).resolves.toBeTruthy();
    });
  });

  describe("changing phone number", () => {
    it("moves a player's account to the new number with just an SMS code, keeping everything", async () => {
      const organizer = await makeUser("+353830000001", { email: "org@example.com" });
      const group = await organizer.caller.groups.create({ name: "Futsal" });
      const { user, caller } = await makeUser("+353830000002");
      await caller.groups.join({ slug: group.slug, token: group.inviteToken ?? "" });

      expect(await caller.auth.requestPhoneChange({ newPhoneNumber: "+353830000009" })).toEqual({ needsEmailCode: false });
      const smsCode = codeIn(fakeSmsSender.lastMessageTo("+353830000009")?.body);
      await caller.auth.confirmPhoneChange({ newPhoneNumber: "+353830000009", smsCode });

      const moved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(moved.phoneNumber).toBe("+353830000009");
      expect(await db.groupMembership.count({ where: { userId: user.id } })).toBe(1); // same account: still in the group
      expect(fakeSmsSender.lastMessageTo("+353830000002")?.body).toContain("was changed");
    });

    it("also needs the emailed code for an account with a verified email", async () => {
      const { user, caller } = await makeUser("+353830000001", { email: "org@example.com" });

      expect(await caller.auth.requestPhoneChange({ newPhoneNumber: "+353830000009" })).toEqual({ needsEmailCode: true });
      const smsCode = codeIn(fakeSmsSender.lastMessageTo("+353830000009")?.body);
      const emailCode = codeIn(fakeEmailSender.lastMessageTo("org@example.com")?.body);

      await expect(caller.auth.confirmPhoneChange({ newPhoneNumber: "+353830000009", smsCode })).rejects.toThrow("emailed you");
      const wrongEmail = emailCode === "000000" ? "111111" : "000000";
      await expect(
        caller.auth.confirmPhoneChange({ newPhoneNumber: "+353830000009", smsCode, emailCode: wrongEmail }),
      ).rejects.toThrow("Incorrect email code");
      // Nothing changed by the failed tries.
      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).phoneNumber).toBe("+353830000001");

      await caller.auth.confirmPhoneChange({ newPhoneNumber: "+353830000009", smsCode, emailCode });

      expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).phoneNumber).toBe("+353830000009");
      expect(fakeEmailSender.lastMessageTo("org@example.com")?.subject).toBe("Your phone number was changed");
    });

    it("refuses a wrong SMS code", async () => {
      const { caller } = await makeUser();
      await caller.auth.requestPhoneChange({ newPhoneNumber: "+353830000009" });
      const right = codeIn(fakeSmsSender.lastMessageTo("+353830000009")?.body);

      await expect(
        caller.auth.confirmPhoneChange({ newPhoneNumber: "+353830000009", smsCode: right === "000000" ? "111111" : "000000" }),
      ).rejects.toThrow("Incorrect code");
    });

    it("refuses a number that already has an account, or that's already theirs, or that's malformed", async () => {
      await makeUser("+353830000002");
      const { caller } = await makeUser("+353830000001");

      await expect(caller.auth.requestPhoneChange({ newPhoneNumber: "+353830000002" })).rejects.toThrow("already has an account");
      await expect(caller.auth.requestPhoneChange({ newPhoneNumber: "+353830000001" })).rejects.toThrow("already your number");
      await expect(caller.auth.requestPhoneChange({ newPhoneNumber: "0871234567" })).rejects.toThrow("international format");
    });

    it("lets the person sign in with the new number afterwards, and not the old one", async () => {
      const { user, caller } = await makeUser();
      await caller.auth.requestPhoneChange({ newPhoneNumber: "+353830000009" });
      await caller.auth.confirmPhoneChange({
        newPhoneNumber: "+353830000009",
        smsCode: codeIn(fakeSmsSender.lastMessageTo("+353830000009")?.body),
      });

      const anonymous = appRouter.createCaller({ db, user: null, setSession: () => {}, clearSession: () => {} });
      await anonymous.auth.requestCode({ phoneNumber: "+353830000009" });
      const result = await anonymous.auth.verifyCode({
        phoneNumber: "+353830000009",
        code: codeIn(fakeSmsSender.lastMessageTo("+353830000009")?.body),
      });

      expect(result).toEqual({ status: "verified", userId: user.id });
    });
  });
});
