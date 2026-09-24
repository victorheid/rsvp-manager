import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { PricingMode, WaitlistMode } from "@/generated/prisma/enums";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc";
import { createEvent } from "@/server/domains/events/actions/createEvent";
import { editEvent } from "@/server/domains/events/actions/editEvent";
import { confirmEvent } from "@/server/domains/events/actions/confirmEvent";
import { getPaymentGateway } from "@/server/integrations/stripe";
import { cancelEvent } from "@/server/domains/events/actions/cancelEvent";
import { getEventBySlug } from "@/server/domains/events/getters/getEventBySlug";
import { getEventDefaults } from "@/server/domains/events/getters/getEventDefaults";
import { costBreakdownSchema } from "@/server/domains/events/costBreakdown";
import { WAITLIST_HOLD_MINUTES_OPTIONS } from "@/server/domains/events/rules";

// Shared by create and edit — same shape both ways (§10.4: "same form").
const eventFormSchema = z.object({
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
  onlineAllowed: z.boolean().optional(),
  autoChargeAtCutoff: z.boolean().optional(),
  waitlistMode: z.nativeEnum(WaitlistMode).optional(),
  waitlistHoldMinutes: z
    .number()
    .int()
    .refine((minutes) => WAITLIST_HOLD_MINUTES_OPTIONS.some((option) => option === minutes), "Pick one of the hold times offered.")
    .optional(),
  openToNonMembers: z.boolean().optional(),
});

export const eventsRouter = router({
  create: protectedProcedure
    .input(eventFormSchema.extend({ groupId: z.string() }))
    .mutation(({ ctx, input }) => createEvent(ctx.db, { ...input, organizerId: ctx.user.id })),

  edit: protectedProcedure
    .input(eventFormSchema.extend({ eventId: z.string() }))
    .mutation(({ ctx, input }) => editEvent(ctx.db, { ...input, organizerId: ctx.user.id })),

  confirm: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => confirmEvent(ctx.db, getPaymentGateway(), { eventId: input.eventId, organizerId: ctx.user.id })),

  cancel: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => cancelEvent(ctx.db, getPaymentGateway(), { eventId: input.eventId, organizerId: ctx.user.id })),

  suggestDefaults: protectedProcedure
    .input(z.object({ groupId: z.string(), startsAt: z.date() }))
    .query(({ ctx, input }) => getEventDefaults(ctx.db, { ...input, organizerId: ctx.user.id })),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const event = await getEventBySlug(ctx.db, input.slug, { viewerId: ctx.user?.id, now: new Date() });

      if (!event) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return event;
    }),
});
