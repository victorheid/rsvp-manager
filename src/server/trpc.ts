import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "@/server/context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * A procedure that requires a signed-in user (§4 of the spec: phone + SMS
 * code, established at RSVP time). Domains that need the current user read
 * `ctx.user` after this middleware, never `ctx.session` directly.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});
