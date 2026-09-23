import { describe, expect, it } from "vitest";
import {
  hasExceededVerificationAttempts,
  hashVerificationCode,
  isValidPhoneNumber,
  isVerificationCodeExpired,
  MAX_VERIFICATION_ATTEMPTS,
} from "./rules";

describe("isValidPhoneNumber", () => {
  it("accepts E.164 numbers", () => {
    expect(isValidPhoneNumber("+353871234567")).toBe(true);
    expect(isValidPhoneNumber("+15551234567")).toBe(true);
  });

  it("rejects numbers without a country code, with spaces, or with a leading zero", () => {
    expect(isValidPhoneNumber("0871234567")).toBe(false);
    expect(isValidPhoneNumber("+353 87 123 4567")).toBe(false);
    expect(isValidPhoneNumber("+0871234567")).toBe(false);
  });
});

describe("hashVerificationCode", () => {
  it("is deterministic", () => {
    expect(hashVerificationCode("123456")).toBe(hashVerificationCode("123456"));
  });

  it("differs for different codes", () => {
    expect(hashVerificationCode("123456")).not.toBe(hashVerificationCode("654321"));
  });
});

describe("isVerificationCodeExpired", () => {
  const expiresAt = new Date("2026-01-10T18:10:00Z");

  it("is not expired before expiry", () => {
    expect(isVerificationCodeExpired({ expiresAt }, new Date("2026-01-10T18:09:59Z"))).toBe(false);
  });

  it("is expired at or after expiry", () => {
    expect(isVerificationCodeExpired({ expiresAt }, new Date("2026-01-10T18:10:00Z"))).toBe(true);
  });
});

describe("hasExceededVerificationAttempts", () => {
  it("allows attempts under the max", () => {
    expect(hasExceededVerificationAttempts({ attempts: MAX_VERIFICATION_ATTEMPTS - 1 })).toBe(false);
  });

  it("blocks once the max is reached", () => {
    expect(hasExceededVerificationAttempts({ attempts: MAX_VERIFICATION_ATTEMPTS })).toBe(true);
  });
});
