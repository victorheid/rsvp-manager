import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { completeOwedPayment, getOwedPayment, startOwedPayment } from "@/server/domains/payments/actions/payOwed";
import { TRPCError } from "@trpc/server";
import { FAKE_CARD_SCENARIOS, getFakePaymentGateway, getPaymentGateway } from "@/server/integrations/stripe";

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

  /**
   * Local-dev stand-in for Stripe.js: while the fake gateway runs, the card
   * form calls this to "enter a card". Refused when a real gateway is wired in.
   */
  devCompleteIntent: protectedProcedure
    .input(z.object({ kind: z.enum(["setup", "payment"]), clientSecret: z.string(), scenario: z.enum(FAKE_CARD_SCENARIOS) }))
    .mutation(({ ctx, input }) => {
      const fake = getFakePaymentGateway();

      if (!fake) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only available with the fake payment gateway." });
      }

      const intentId = fake.intentIdFromClientSecret(input.clientSecret);

      if (input.kind === "setup") {
        fake.completeSetupIntent(intentId, input.scenario);
      } else {
        fake.completePaymentIntent(intentId, input.scenario, `cus_fake_${ctx.user.id}`);
      }

      return { ok: true };
    }),
});
