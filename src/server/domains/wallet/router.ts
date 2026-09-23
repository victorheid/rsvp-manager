import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { completeTopUp } from "@/server/domains/wallet/actions/completeTopUp";
import { startTopUp } from "@/server/domains/wallet/actions/startTopUp";
import { getWalletSummary } from "@/server/domains/wallet/getters/getWalletSummary";
import { getPaymentGateway } from "@/server/integrations/stripe";

export const walletRouter = router({
  summary: protectedProcedure.query(({ ctx }) => getWalletSummary(ctx.db, ctx.user.id)),

  startTopUp: protectedProcedure
    .input(z.object({ amountCents: z.number().int() }))
    .mutation(({ ctx, input }) =>
      startTopUp(ctx.db, getPaymentGateway(), { userId: ctx.user.id, amountCents: input.amountCents }, new Date()),
    ),

  completeTopUp: protectedProcedure
    .input(z.object({ paymentId: z.string() }))
    .mutation(({ ctx, input }) =>
      completeTopUp(ctx.db, getPaymentGateway(), { userId: ctx.user.id, paymentId: input.paymentId }),
    ),
});
