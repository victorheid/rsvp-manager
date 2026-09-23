import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc";
import { createGroup } from "@/server/domains/groups/actions/createGroup";
import { getGroupBySlug } from "@/server/domains/groups/getters/getGroupBySlug";

export const groupsRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      createGroup(ctx.db, { organizerId: ctx.user.id, ...input }),
    ),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const group = await getGroupBySlug(ctx.db, input.slug);

      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return group;
    }),
});
