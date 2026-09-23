import { router } from "@/server/trpc";
import { authRouter } from "@/server/domains/auth";
import { groupsRouter } from "@/server/domains/groups";
import { eventsRouter } from "@/server/domains/events";
import { rsvpsRouter } from "@/server/domains/rsvps";
import { waitlistRouter } from "@/server/domains/waitlist";
import { notificationsRouter } from "@/server/domains/notifications";

/**
 * Root tRPC router. One line per domain — deleting a domain means deleting
 * its folder plus the line here.
 */
export const appRouter = router({
  auth: authRouter,
  groups: groupsRouter,
  events: eventsRouter,
  rsvps: rsvpsRouter,
  waitlist: waitlistRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
