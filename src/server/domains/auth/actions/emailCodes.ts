import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import type { EmailCodePurpose } from "@/generated/prisma/enums";
import {
  hasExceededVerificationAttempts,
  hashVerificationCode,
  isVerificationCodeExpired,
  VERIFICATION_CODE_TTL_MS,
} from "@/server/domains/auth/rules";
import type { EmailSender } from "@/server/integrations/email";

/**
 * Creates a fresh 6-digit email code for a user and purpose, invalidating any
 * outstanding one, and emails it. Private plumbing for this domain's actions.
 */
export async function issueEmailCode(
  db: Db,
  emailSender: EmailSender,
  input: { userId: string; purpose: EmailCodePurpose; email: string; subject: string },
  now: Date,
) {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

  await db.$transaction([
    db.emailVerificationCode.updateMany({
      where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
      data: { consumedAt: now },
    }),
    db.emailVerificationCode.create({
      data: {
        userId: input.userId,
        purpose: input.purpose,
        email: input.email,
        codeHash: hashVerificationCode(code),
        expiresAt: new Date(now.getTime() + VERIFICATION_CODE_TTL_MS),
      },
    }),
  ]);

  // After the write, never inside a transaction: this calls an external service.
  await emailSender.send({
    to: input.email,
    subject: input.subject,
    body: `Your code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
  });
}

/**
 * Checks a code against the latest outstanding one for this user and
 * purpose; a wrong code counts an attempt, a right one is consumed. Returns
 * the code's row (so callers can read which address it was for). Run inside
 * the caller's transaction so consuming it is atomic with what it unlocks.
 */
export async function consumeEmailCode(
  tx: Db,
  /** The plain client, for counting a wrong attempt: inside `tx` it would be rolled back by the error thrown right after. */
  root: Db,
  input: { userId: string; purpose: EmailCodePurpose; code: string },
  now: Date,
) {
  const verification = await tx.emailVerificationCode.findFirst({
    where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!verification || isVerificationCodeExpired(verification, now)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That email code has expired. Request a new one." });
  }

  if (hasExceededVerificationAttempts(verification)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Too many incorrect attempts. Request a new code." });
  }

  if (verification.codeHash !== hashVerificationCode(input.code)) {
    await root.emailVerificationCode.update({ where: { id: verification.id }, data: { attempts: { increment: 1 } } });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect email code." });
  }

  await tx.emailVerificationCode.update({ where: { id: verification.id }, data: { consumedAt: now } });

  return verification;
}
