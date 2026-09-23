import { router } from "@/server/trpc";
import { authRouter } from "@/server/domains/auth";
import { groupsRouter } from "@/server/domains/groups";
import { eventsRouter } from "@/server/domains/events";

/**
 * Root tRPC router. One line per domain — deleting a domain means deleting
 * its folder plus the line here.
 */
export const appRouter = router({
  auth: authRouter,
  groups: groupsRouter,
  events: eventsRouter,
});

export type AppRouter = typeof appRouter;
