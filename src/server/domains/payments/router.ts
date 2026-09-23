import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { completeOwedPayment, getOwedPayment, startOwedPayment } from "@/server/domains/payments/actions/payOwed";
import { getPaymentGateway } from "@/server/integrations/stripe";

/** The /pay/{token} page (UI spec §7.6): pay what a failed card charge left owing. */
export const paymentsRouter = router({
  owed: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(({ ctx, input }) => getOwedPayment(ctx.db, { token: input.token, userId: ctx.user.id })),

  startOwedPayment: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(({ ctx, input }) =>
      startOwedPayment(ctx.db, getPaymentGateway(), { token: input.token, userId: ctx.user.id }),
    ),

  completeOwedPayment: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(({ ctx, input }) =>
      completeOwedPayment(ctx.db, getPaymentGateway(), { token: input.token, userId: ctx.user.id }),
    ),
});
