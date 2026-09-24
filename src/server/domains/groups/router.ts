import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "@/server/trpc";
import { createGroup } from "@/server/domains/groups/actions/createGroup";
import { editGroup } from "@/server/domains/groups/actions/editGroup";
import { joinGroup } from "@/server/domains/groups/actions/joinGroup";
import { leaveGroup } from "@/server/domains/groups/actions/leaveGroup";
import { removeMember } from "@/server/domains/groups/actions/removeMember";
import { stopInviteLink } from "@/server/domains/groups/actions/stopInviteLink";
import { updateInviteLink } from "@/server/domains/groups/actions/updateInviteLink";
import { getGroupBySlug } from "@/server/domains/groups/getters/getGroupBySlug";
import { getGroupMembers } from "@/server/domains/groups/getters/getGroupMembers";
import { getGroupsForUser } from "@/server/domains/groups/getters/getGroupsForUser";
import { getInvite } from "@/server/domains/groups/getters/getInvite";
import { INVITE_EXPIRY_CHOICES } from "@/server/domains/groups/rules";

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
    .input(z.object({ slug: z.string(), token: z.string() }))
    .mutation(({ ctx, input }) => joinGroup(ctx.db, { ...input, userId: ctx.user.id }, new Date())),

  invite: publicProcedure
    .input(z.object({ slug: z.string(), token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await getInvite(ctx.db, { ...input, viewerId: ctx.user?.id }, new Date());

      if (!invite) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return invite;
    }),

  updateInvite: protectedProcedure
    .input(z.object({ groupId: z.string(), expiry: z.enum(INVITE_EXPIRY_CHOICES), reset: z.boolean() }))
    .mutation(({ ctx, input }) => updateInviteLink(ctx.db, { ...input, organizerId: ctx.user.id }, new Date())),

  stopInvite: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(({ ctx, input }) => stopInviteLink(ctx.db, { groupId: input.groupId, organizerId: ctx.user.id })),

  members: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(({ ctx, input }) => getGroupMembers(ctx.db, { slug: input.slug, viewerId: ctx.user.id })),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), memberUserId: z.string() }))
    .mutation(({ ctx, input }) => removeMember(ctx.db, { ...input, organizerId: ctx.user.id })),

  leave: protectedProcedure
    .input(z.object({ groupId: z.string() }))
    .mutation(({ ctx, input }) => leaveGroup(ctx.db, { groupId: input.groupId, userId: ctx.user.id })),

  edit: protectedProcedure
    .input(z.object({ groupId: z.string(), name: z.string().min(1).max(120), description: z.string().max(2000).optional() }))
    .mutation(({ ctx, input }) => editGroup(ctx.db, { ...input, organizerId: ctx.user.id })),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const group = await getGroupBySlug(ctx.db, input.slug, { viewerId: ctx.user?.id, now: new Date() });

      if (!group) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      return group;
    }),

  mine: protectedProcedure.query(({ ctx }) => getGroupsForUser(ctx.db, ctx.user.id)),
});
