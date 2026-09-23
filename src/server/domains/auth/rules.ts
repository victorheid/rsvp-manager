import { createHash } from "node:crypto";
import type { VerificationCodeModel } from "@/generated/prisma/models";

/**
 * Business rules for auth (spec §4, decision 1: phone + SMS code, only at
 * RSVP). Pure functions only: no Prisma calls, no Date.now(), no I/O.
 */

const PHONE_PATTERN = /^\+[1-9]\d{6,14}$/;

export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_VERIFICATION_ATTEMPTS = 5;

export function isValidPhoneNumber(phoneNumber: string): boolean {
  return PHONE_PATTERN.test(phoneNumber);
}

/** Deterministic hash so codes are never stored in plaintext. */
export function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

export function isVerificationCodeExpired(
  verification: Pick<VerificationCodeModel, "expiresAt">,
  now: Date,
): boolean {
  return now.getTime() >= verification.expiresAt.getTime();
}

export function hasExceededVerificationAttempts(
  verification: Pick<VerificationCodeModel, "attempts">,
): boolean {
  return verification.attempts >= MAX_VERIFICATION_ATTEMPTS;
}
