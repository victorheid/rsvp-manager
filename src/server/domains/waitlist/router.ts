import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { joinWaitlist } from "@/server/domains/waitlist/actions/joinWaitlist";
import { leaveWaitlist } from "@/server/domains/waitlist/actions/leaveWaitlist";

export const waitlistRouter = router({
  join: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => joinWaitlist(ctx.db, { eventId: input.eventId, userId: ctx.user.id })),

  leave: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => leaveWaitlist(ctx.db, { eventId: input.eventId, userId: ctx.user.id })),
});
