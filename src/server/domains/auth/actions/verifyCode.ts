import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import {
  hasExceededVerificationAttempts,
  hashVerificationCode,
  isVerificationCodeExpired,
} from "@/server/domains/auth/rules";

export interface VerifyCodeInput {
  phoneNumber: string;
  code: string;
  /** Only required the first time this phone number signs in. */
  name?: string;
}

export type VerifyCodeResult =
  | { status: "verified"; userId: string }
  | { status: "needs_name" };

/**
 * Verifies a code sent by `requestVerificationCode` and signs the phone
 * number in, creating the account on first sign-in (§4, decision 1). The
 * router turns "verified" into a session cookie; that's transport, not
 * business logic, so it stays out of this action.
 */
export async function verifyCode(db: Db, input: VerifyCodeInput, now: Date): Promise<VerifyCodeResult> {
  return db.$transaction(async (tx) => {
    const verification = await tx.verificationCode.findFirst({
      where: { phoneNumber: input.phoneNumber, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!verification || isVerificationCodeExpired(verification, now)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That code has expired. Request a new one.",
      });
    }

    if (hasExceededVerificationAttempts(verification)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Too many incorrect attempts. Request a new code.",
      });
    }

    if (verification.codeHash !== hashVerificationCode(input.code)) {
      // Counted on the plain client: inside `tx` the increment would be rolled
      // back by the error thrown right after, and the attempt limit would never bite.
      await db.verificationCode.update({
        where: { id: verification.id },
        data: { attempts: { increment: 1 } },
      });

      throw new TRPCError({ code: "BAD_REQUEST", message: "Incorrect code." });
    }

    const existingUser = await tx.user.findUnique({
      where: { phoneNumber: input.phoneNumber },
    });

    if (existingUser) {
      await tx.verificationCode.update({
        where: { id: verification.id },
        data: { consumedAt: now },
      });

      return { status: "verified", userId: existingUser.id };
    }

    // A brand-new phone number without a name yet doesn't consume the code:
    // the client resubmits the same phone + code together with the name.
    const { name } = input;

    if (!name) {
      return { status: "needs_name" };
    }

    await tx.verificationCode.update({
      where: { id: verification.id },
      data: { consumedAt: now },
    });

    const user = await tx.user.create({
      data: { phoneNumber: input.phoneNumber, name },
    });

    return { status: "verified", userId: user.id };
  });
}
