import { z } from "zod";
import { PaymentMethod, PaymentStatus } from "@/generated/prisma/enums";
import { protectedProcedure, router } from "@/server/trpc";
import { createRsvp } from "@/server/domains/rsvps/actions/createRsvp";
import { dropRsvp } from "@/server/domains/rsvps/actions/dropRsvp";
import { markAttendance } from "@/server/domains/rsvps/actions/markAttendance";
import { markPaidOutsideApp } from "@/server/domains/rsvps/actions/markPaidOutsideApp";
import { removeRsvp } from "@/server/domains/rsvps/actions/removeRsvp";
import { addWalkIn } from "@/server/domains/rsvps/actions/addWalkIn";
import { getUpcomingRsvpsForUser } from "@/server/domains/rsvps/getters/getUpcomingRsvpsForUser";
import { getRsvpsForOrganizer } from "@/server/domains/rsvps/getters/getRsvpsForOrganizer";

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

  forOrganizer: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .query(({ ctx, input }) => getRsvpsForOrganizer(ctx.db, { eventId: input.eventId, organizerId: ctx.user.id })),

  markAttendance: protectedProcedure
    .input(z.object({ rsvpId: z.string(), attended: z.boolean().nullable() }))
    .mutation(({ ctx, input }) =>
      markAttendance(ctx.db, { rsvpId: input.rsvpId, organizerId: ctx.user.id, attended: input.attended }),
    ),

  markPaidOutsideApp: protectedProcedure
    .input(z.object({ rsvpId: z.string() }))
    .mutation(({ ctx, input }) =>
      markPaidOutsideApp(ctx.db, { rsvpId: input.rsvpId, organizerId: ctx.user.id }),
    ),

  remove: protectedProcedure
    .input(z.object({ rsvpId: z.string() }))
    .mutation(({ ctx, input }) => removeRsvp(ctx.db, { rsvpId: input.rsvpId, organizerId: ctx.user.id })),

  addWalkIn: protectedProcedure
    .input(
      z.object({
        eventId: z.string(),
        name: z.string().min(1).max(120),
        paymentStatus: z.enum([PaymentStatus.PAID_OUTSIDE_APP, PaymentStatus.OWES]),
      }),
    )
    .mutation(({ ctx, input }) => addWalkIn(ctx.db, { ...input, organizerId: ctx.user.id })),
});
