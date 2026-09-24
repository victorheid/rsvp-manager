import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc";
import { getEmailSender } from "@/server/integrations/email";
import { confirmPhoneChange, requestPhoneChange } from "@/server/domains/auth/actions/changePhoneNumber";
import { requestEmailVerification, verifyEmail } from "@/server/domains/auth/actions/verifyEmail";
import { getAccount } from "@/server/domains/auth/getters/getAccount";
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
        name: z.string().trim().min(1).max(40).optional(),
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

  account: protectedProcedure.query(({ ctx }) => getAccount(ctx.db, ctx.user.id)),

  requestEmailVerification: protectedProcedure
    .input(z.object({ email: z.email() }))
    .mutation(({ ctx, input }) => requestEmailVerification(ctx.db, getEmailSender(), { userId: ctx.user.id, email: input.email }, new Date())),

  verifyEmail: protectedProcedure
    .input(z.object({ code: z.string().length(6) }))
    .mutation(({ ctx, input }) =>
      verifyEmail(ctx.db, { email: getEmailSender(), sms: getSmsSender() }, { userId: ctx.user.id, code: input.code }, new Date()),
    ),

  requestPhoneChange: protectedProcedure
    .input(z.object({ newPhoneNumber: z.string() }))
    .mutation(({ ctx, input }) =>
      requestPhoneChange(ctx.db, { email: getEmailSender(), sms: getSmsSender() }, { userId: ctx.user.id, newPhoneNumber: input.newPhoneNumber }, new Date()),
    ),

  confirmPhoneChange: protectedProcedure
    .input(z.object({ newPhoneNumber: z.string(), smsCode: z.string().length(6), emailCode: z.string().length(6).optional() }))
    .mutation(({ ctx, input }) =>
      confirmPhoneChange(ctx.db, { email: getEmailSender(), sms: getSmsSender() }, { userId: ctx.user.id, ...input }, new Date()),
    ),
});
