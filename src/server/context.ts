import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { db } from "@/server/db";
import { createSessionCookie, expireSessionCookie, readSessionUserId } from "@/server/domains/auth";

export interface SessionUser {
  id: string;
  phoneNumber: string;
}

/**
 * Per-request tRPC context. Reads the session cookie and resolves the
 * signed-in user; nothing else should read cookies/headers directly.
 * `setSession`/`clearSession` are transport plumbing for the auth router —
 * writing a `Set-Cookie` response header, not business logic.
 */
export async function createContext({ req, resHeaders }: FetchCreateContextFnOptions) {
  const now = new Date();
  const userId = readSessionUserId(req.headers.get("cookie"), now);
  const user: SessionUser | null = userId
    ? await db.user.findUnique({ where: { id: userId }, select: { id: true, phoneNumber: true } })
    : null;

  return {
    db,
    user,
    setSession(id: string) {
      resHeaders.append("set-cookie", createSessionCookie(id, now));
    },
    clearSession() {
      resHeaders.append("set-cookie", expireSessionCookie());
    },
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
