import { z } from "zod";
import { protectedProcedure, router } from "@/server/trpc";
import { pushSubscriptionSchema } from "@/server/integrations/push";
import { testMessage } from "@/server/domains/notifications/rules";
import { notifyUsers } from "@/server/domains/notifications/actions/notifyUsers";
import { subscribePush } from "@/server/domains/notifications/actions/subscribePush";
import { unsubscribePush } from "@/server/domains/notifications/actions/unsubscribePush";

export const notificationsRouter = router({
  subscribePush: protectedProcedure
    .input(z.object({ subscription: pushSubscriptionSchema }))
    .mutation(({ ctx, input }) => subscribePush(ctx.db, { userId: ctx.user.id, subscription: input.subscription })),

  unsubscribePush: protectedProcedure
    .input(z.object({ endpoint: z.string() }))
    .mutation(({ ctx, input }) => unsubscribePush(ctx.db, { userId: ctx.user.id, endpoint: input.endpoint })),

  /** The "Send test" button on /me (UI spec §9.1). */
  sendTest: protectedProcedure.mutation(({ ctx }) =>
    notifyUsers(ctx.db, {
      userIds: [ctx.user.id],
      message: testMessage(),
    }),
  ),
});
