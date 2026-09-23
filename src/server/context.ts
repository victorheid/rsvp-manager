import { db } from "@/server/db";

export interface SessionUser {
  id: string;
  phoneNumber: string;
}

/**
 * Per-request tRPC context. `user` is null until the auth domain is wired
 * up (see specs/tasks.md §0) — it reads the session and resolves the
 * signed-in user. Nothing else should read cookies/headers directly.
 */
export function createContext(): { db: typeof db; user: SessionUser | null } {
  return {
    db,
    user: null,
  };
}

export type Context = ReturnType<typeof createContext>;
