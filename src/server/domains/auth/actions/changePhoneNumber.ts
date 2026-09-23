import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { EmailCodePurpose } from "@/generated/prisma/enums";
import { consumeEmailCode, issueEmailCode } from "@/server/domains/auth/actions/emailCodes";
import {
  hasExceededVerificationAttempts,
  hashVerificationCode,
  isValidPhoneNumber,
  isVerificationCodeExpired,
  VERIFICATION_CODE_TTL_MS,
} from "@/server/domains/auth/rules";
import type { EmailSender } from "@/server/integrations/email";
import type { SmsSender } from "@/server/integrations/sms";

type Senders = { email: EmailSender; sms: SmsSender };

/**
 * First step of changing a phone number: a code goes by SMS to the *new*
 * number (proving it's theirs) and, if the account has a verified email, a
 * second code goes to that email (proving it's really them, not just
 * whoever holds the old or new SIM). Players without an email need only the
 * SMS code.
 */
export async function requestPhoneChange(
  db: Db,
  senders: Senders,
  input: { userId: string; newPhoneNumber: string },
  now: Date,
) {
  if (!isValidPhoneNumber(input.newPhoneNumber)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a phone number in international format, e.g. +353871234567." });
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: input.userId } });

  if (user.phoneNumber === input.newPhoneNumber) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That's already your number." });
  }

  // Merging two accounts (groups, RSVPs, wallets) is a support job, not something to guess at.
  if (await db.user.findUnique({ where: { phoneNumber: input.newPhoneNumber } })) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That number already has an account. Contact support to merge them." });
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  await db.$transaction([
    db.verificationCode.updateMany({ where: { phoneNumber: input.newPhoneNumber, consumedAt: null }, data: { consumedAt: now } }),
    db.verificationCode.create({
      data: {
        phoneNumber: input.newPhoneNumber,
        codeHash: hashVerificationCode(code),
        expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
      },
    }),
  ]);
  await senders.sms.send({ to: input.newPhoneNumber, body: `Your RSVP Manager code is ${code}. It expires in 10 minutes.` });

  if (user.email && user.emailVerifiedAt) {
    await issueEmailCode(
      db,
      senders.email,
      { userId: user.id, purpose: EmailCodePurpose.CHANGE_PHONE, email: user.email, subject: "Confirm your new phone number" },
      now,
    );
  }

  return { needsEmailCode: Boolean(user.email && user.emailVerifiedAt) };
}

/**
 * Second step: both codes right, the number changes in place — same user
 * id, so groups, RSVPs, wallet, saved cards and the payout account all
 * follow. The old number (by SMS) and the email hear about it, so a takeover
 * doesn't go unnoticed.
 */
export async function confirmPhoneChange(
  db: Db,
  senders: Senders,
  input: { userId: string; newPhoneNumber: string; smsCode: string; emailCode?: string },
  now: Date,
) {
  const { before, after } = await db.$transaction(async (tx) => {
    const user = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
    const needsEmail = Boolean(user.email && user.emailVerifiedAt);

    if (needsEmail && !input.emailCode) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Enter the code we emailed you as well." });
    }

    const verification = await tx.verificationCode.findFirst({
      where: { phoneNumber: input.newPhoneNumber, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!verification || isVerificationCodeExpired(verification, now)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That code has expired. Request a new one." });
    }

    if (hasExceededVerificationAttempts(verification)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Too many incorrect attempts. Request a new code." });
    }

    if (verification.codeHash !== hashVerificationCode(input.smsCode)) {
      // Counted on the plain client: inside `tx` it would be rolled back by the error thrown right after.
      await db.verificationCode.update({ where: { id: verification.id }, data: { attempts: { increment: 1 } } });
      throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect code." });
    }

    if (needsEmail && input.emailCode) {
      await consumeEmailCode(tx, db, { userId: user.id, purpose: EmailCodePurpose.CHANGE_PHONE, code: input.emailCode }, now);
    }

    if (await tx.user.findUnique({ where: { phoneNumber: input.newPhoneNumber } })) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "That number already has an account. Contact support to merge them." });
    }

    await tx.verificationCode.update({ where: { id: verification.id }, data: { consumedAt: now } });
    const updated = await tx.user.update({ where: { id: user.id }, data: { phoneNumber: input.newPhoneNumber } });

    return { before: user, after: updated };
  });

  await senders.sms.send({ to: before.phoneNumber, body: `Your RSVP Manager number was changed to ${after.phoneNumber}. If that wasn't you, contact support.` });
  if (before.email && before.emailVerifiedAt) {
    await senders.email.send({
      to: before.email,
      subject: "Your phone number was changed",
      body: `The phone number on your RSVP Manager account was changed to ${after.phoneNumber}. If that wasn't you, contact support.`,
    });
  }

  return { phoneNumber: after.phoneNumber };
}
