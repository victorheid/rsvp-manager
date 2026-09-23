import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc";
import { createGroup } from "@/server/domains/groups/actions/createGroup";
import { editGroup } from "@/server/domains/groups/actions/editGroup";
import { joinGroup } from "@/server/domains/groups/actions/joinGroup";
import { getGroupBySlug } from "@/server/domains/groups/getters/getGroupBySlug";
import { getGroupsForUser } from "@/server/domains/groups/getters/getGroupsForUser";

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

  join: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(({ ctx, input }) => joinGroup(ctx.db, { slug: input.slug, userId: ctx.user.id })),

  edit: protectedProcedure
    .input(z.object({ groupId: z.string(), name: z.string().min(1).max(120), description: z.string().max(2000).optional() }))
    .mutation(({ ctx, input }) => editGroup(ctx.db, { ...input, organizerId: ctx.user.id })),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const group = await getGroupBySlug(ctx.db, input.slug, { viewerId: ctx.user?.id });

      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return group;
    }),

  mine: protectedProcedure.query(({ ctx }) => getGroupsForUser(ctx.db, ctx.user.id)),
});
