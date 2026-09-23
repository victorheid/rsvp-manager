import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "@/server/trpc";
import { refreshOnboarding } from "@/server/domains/payouts/actions/refreshOnboarding";
import { startOnboarding } from "@/server/domains/payouts/actions/startOnboarding";
import { getOnboardingStatus } from "@/server/domains/payouts/getters/getOnboardingStatus";
import { isSafeReturnPath } from "@/server/domains/payouts/rules";
import { getPaymentGateway } from "@/server/integrations/stripe";

const APP_URL = () => process.env.APP_URL ?? "http://localhost:3000";

export const payoutsRouter = router({
  onboardingStatus: protectedProcedure.query(({ ctx }) => getOnboardingStatus(ctx.db, ctx.user.id)),

  startOnboarding: protectedProcedure
    .input(z.object({ returnPath: z.string() }))
    .mutation(({ ctx, input }) => {
      if (!isSafeReturnPath(input.returnPath)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid return path." });
      }

      return startOnboarding(ctx.db, getPaymentGateway(), {
        userId: ctx.user.id,
        returnUrl: new URL(input.returnPath, APP_URL()).href,
      });
    }),

  refreshOnboarding: protectedProcedure.mutation(({ ctx }) =>
    refreshOnboarding(ctx.db, getPaymentGateway(), { userId: ctx.user.id }),
  ),
});
