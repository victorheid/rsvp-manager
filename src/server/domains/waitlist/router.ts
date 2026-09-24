import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { joinWaitlist } from "@/server/domains/waitlist/actions/joinWaitlist";
import { leaveWaitlist } from "@/server/domains/waitlist/actions/leaveWaitlist";
import { markWaitlistDroppedOut } from "@/server/domains/waitlist/actions/markWaitlistDroppedOut";

export const waitlistRouter = router({
  join: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => joinWaitlist(ctx.db, { eventId: input.eventId, userId: ctx.user.id }, new Date())),

  leave: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => leaveWaitlist(ctx.db, { eventId: input.eventId, userId: ctx.user.id }, new Date())),

  markDroppedOut: protectedProcedure
    .input(z.object({ entryId: z.string() }))
    .mutation(({ ctx, input }) => markWaitlistDroppedOut(ctx.db, { entryId: input.entryId, organizerId: ctx.user.id }, new Date())),
});
