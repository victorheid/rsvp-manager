import { randomInt } from "node:crypto";
import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import type { SmsSender } from "@/server/integrations/sms";
import {
  hashVerificationCode,
  isValidPhoneNumber,
  VERIFICATION_CODE_TTL_MS,
} from "@/server/domains/auth/rules";

export interface RequestVerificationCodeInput {
  phoneNumber: string;
}

/**
 * Sends a fresh 6-digit code to a phone number (§4: phone + SMS code).
 * Any code already outstanding for that number is invalidated first, so
 * only the most recently requested one ever verifies.
 */
export async function requestVerificationCode(
  db: Db,
  sms: SmsSender,
  input: RequestVerificationCodeInput,
  now: Date,
) {
  if (!isValidPhoneNumber(input.phoneNumber)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Enter a phone number in international format, e.g. +353871234567.",
    });
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const expiresAt = new Date(now.getTime() + VERIFICATION_CODE_TTL_MS);

  await db.$transaction(async (tx) => {
    await tx.verificationCode.updateMany({
      where: { phoneNumber: input.phoneNumber, consumedAt: null },
      data: { consumedAt: now },
    });

    await tx.verificationCode.create({
      data: {
        phoneNumber: input.phoneNumber,
        codeHash: hashVerificationCode(code),
        expiresAt,
      },
    });
  });

  // External call happens after commit, never inside the transaction.
  await sms.send({
    to: input.phoneNumber,
    body: `Your RSVP Manager code is ${code}. It expires in 10 minutes.`,
  });

  return { expiresAt };
}
