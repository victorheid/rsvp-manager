import { z } from "zod";
import { PaymentMethod } from "@/generated/prisma/enums";
import { protectedProcedure, router } from "@/server/trpc";
import { createRsvp } from "@/server/domains/rsvps/actions/createRsvp";
import { dropRsvp } from "@/server/domains/rsvps/actions/dropRsvp";
import { getUpcomingRsvpsForUser } from "@/server/domains/rsvps/getters/getUpcomingRsvpsForUser";

export const rsvpsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        paymentMethod: z.nativeEnum(PaymentMethod),
      }),
    )
    .mutation(({ ctx, input }) =>
      createRsvp(ctx.db, { eventId: input.eventId, userId: ctx.user.id, paymentMethod: input.paymentMethod }),
    ),

  drop: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) =>
      dropRsvp(ctx.db, { eventId: input.eventId, userId: ctx.user.id }, new Date()),
    ),

  myUpcoming: protectedProcedure.query(({ ctx }) =>
    getUpcomingRsvpsForUser(ctx.db, ctx.user.id, new Date()),
  ),
});
