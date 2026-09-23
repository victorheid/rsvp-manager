import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PricingMode } from "@/generated/prisma/enums";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc";
import { createEvent } from "@/server/domains/events/actions/createEvent";
import { confirmEvent } from "@/server/domains/events/actions/confirmEvent";
import { cancelEvent } from "@/server/domains/events/actions/cancelEvent";
import { getEventBySlug } from "@/server/domains/events/getters/getEventBySlug";
import { costBreakdownSchema } from "@/server/domains/events/costBreakdown";

export const eventsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        groupId: z.string(),
        title: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        startsAt: z.date(),
        endsAt: z.date(),
        location: z.string().min(1),
        cutoffAt: z.date(),
        minPlayers: z.number().int().positive().optional(),
        maxPlayers: z.number().int().positive().optional(),
        totalCostCents: z.number().int().nonnegative(),
        costBreakdown: costBreakdownSchema.optional(),
        pricingMode: z.nativeEnum(PricingMode),
        cashAllowed: z.boolean().optional(),
        autoChargeAtCutoff: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => createEvent(ctx.db, { ...input, organizerId: ctx.user.id })),

  confirm: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => confirmEvent(ctx.db, { eventId: input.eventId, organizerId: ctx.user.id })),

  cancel: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => cancelEvent(ctx.db, { eventId: input.eventId, organizerId: ctx.user.id })),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const event = await getEventBySlug(ctx.db, input.slug, { viewerId: ctx.user?.id });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return event;
    }),
});
