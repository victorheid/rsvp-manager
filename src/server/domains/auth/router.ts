import { z } from "zod";
import { publicProcedure, router } from "@/server/trpc";
import { getSmsSender } from "@/server/integrations/sms";
import { requestVerificationCode } from "@/server/domains/auth/actions/requestVerificationCode";
import { verifyCode } from "@/server/domains/auth/actions/verifyCode";

export const authRouter = router({
  requestCode: publicProcedure
    .input(z.object({ phoneNumber: z.string() }))
    .mutation(({ ctx, input }) =>
      requestVerificationCode(ctx.db, getSmsSender(), input, new Date()),
    ),

  verifyCode: publicProcedure
    .input(
      z.object({
        phoneNumber: z.string(),
        code: z.string().length(6),
        firstName: z.string().min(1).max(60).optional(),
        lastInitial: z.string().length(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await verifyCode(ctx.db, input, new Date());

      if (result.status === "verified") {
        ctx.setSession(result.userId);
      }

      return result;
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    ctx.clearSession();
    return { ok: true };
  }),

  me: publicProcedure.query(({ ctx }) => ctx.user),
});
