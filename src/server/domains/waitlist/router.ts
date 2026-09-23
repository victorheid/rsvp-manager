import { z } from "zod";
import { PaymentMethod, WaitlistPromotionMode } from "@/generated/prisma/enums";
import { protectedProcedure, router } from "@/server/trpc";
import { joinWaitlist } from "@/server/domains/waitlist/actions/joinWaitlist";
import { leaveWaitlist } from "@/server/domains/waitlist/actions/leaveWaitlist";
import { setWaitlistMode } from "@/server/domains/waitlist/actions/setWaitlistMode";
import { getPaymentGateway } from "@/server/integrations/stripe";

const preferenceSchema = z.object({
  mode: z.nativeEnum(WaitlistPromotionMode),
  paymentMethod: z.enum([PaymentMethod.WALLET, PaymentMethod.CARD]).optional(),
  setupIntentId: z.string().optional(),
});

export const waitlistRouter = router({
  join: protectedProcedure
    .input(z.object({ eventId: z.string(), preference: preferenceSchema.optional() }))
    .mutation(({ ctx, input }) =>
      joinWaitlist(ctx.db, getPaymentGateway(), { eventId: input.eventId, userId: ctx.user.id, preference: input.preference }, new Date()),
    ),

  setMode: protectedProcedure
    .input(z.object({ eventId: z.string(), preference: preferenceSchema }))
    .mutation(({ ctx, input }) =>
      setWaitlistMode(ctx.db, getPaymentGateway(), { eventId: input.eventId, userId: ctx.user.id, preference: input.preference }),
    ),

  leave: protectedProcedure
    .input(z.object({ eventId: z.string() }))
    .mutation(({ ctx, input }) => leaveWaitlist(ctx.db, { eventId: input.eventId, userId: ctx.user.id })),
});
