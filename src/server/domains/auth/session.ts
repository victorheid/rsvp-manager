import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stateless session cookie: `<userId>.<expiryMs>.<hmac>`. No session table —
 * the signature is the only thing that needs verifying, so there's nothing
 * to look up or garbage-collect.
 */

const COOKIE_NAME = "rsvp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function secret(): string {
  const value = process.env.AUTH_SECRET;

  if (!value) {
    throw new Error("AUTH_SECRET is not set — copy .env.example to .env and fill it in.");
  }

  return value;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

function serializeCookie(value: string, maxAgeSeconds: number): string {
  const attrs = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === "production") {
    attrs.push("Secure");
  }

  return attrs.join("; ");
}

export function createSessionCookie(userId: string, now: Date): string {
  const expiresAt = now.getTime() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  const cookieValue = `${payload}.${sign(payload)}`;

  return serializeCookie(cookieValue, SESSION_TTL_MS / 1000);
}

export function expireSessionCookie(): string {
  return serializeCookie("", 0);
}

/** Returns the signed-in user's id, or null if there isn't a valid one. */
export function readSessionUserId(cookieHeader: string | null, now: Date): string | null {
  const cookieValue = parseCookieHeader(cookieHeader)[COOKIE_NAME];

  if (!cookieValue) {
    return null;
  }

  const [userId, expiresAtRaw, signature] = cookieValue.split(".");

  if (!userId || !expiresAtRaw || !signature) {
    return null;
  }

  const payload = `${userId}.${expiresAtRaw}`;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  const expiresAt = Number(expiresAtRaw);

  if (!Number.isFinite(expiresAt) || now.getTime() >= expiresAt) {
    return null;
  }

  return userId;
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separatorIndex = part.indexOf("=");
        return [part.slice(0, separatorIndex), part.slice(separatorIndex + 1)];
      }),
  );
}
