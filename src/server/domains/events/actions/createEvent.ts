import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PricingMode } from "@/generated/prisma/enums";
import { slugify } from "@/server/domains/groups/rules";
import { notifyUsers, notificationRules } from "@/server/domains/notifications";
import type { CostBreakdownItem } from "@/server/domains/events/costBreakdown";

export interface CreateEventInput {
  groupId: string;
  organizerId: string;
  title: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  cutoffAt: Date;
  minPlayers?: number;
  maxPlayers?: number;
  totalCostCents: number;
  costBreakdown?: CostBreakdownItem[];
  pricingMode: PricingMode;
  cashAllowed?: boolean;
  autoChargeAtCutoff?: boolean;
}

/**
 * Creates an event within a group (§2), organizer only. Slug uniqueness is
 * scoped globally (public /e/{slug} links), so we suffix on collision
 * rather than failing the whole create.
 */
export async function createEvent(db: Db, input: CreateEventInput) {
  const group = await db.group.findUnique({
    where: { id: input.groupId },
    select: { organizerId: true, name: true },
  });

  if (!group) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Group not found." });
  }

  if (group.organizerId !== input.organizerId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the group's organizer can create events." });
  }

  if (input.endsAt <= input.startsAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "End time must be after the start time.",
    });
  }

  if (input.cutoffAt >= input.startsAt) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cut-off must be before the event start time.",
    });
  }

  if (input.maxPlayers !== undefined && input.maxPlayers < (input.minPlayers ?? 1)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Max players can't be below min players.",
    });
  }

  const baseSlug = slugify(input.title);
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const event = await db.event.create({
    data: {
      slug,
      groupId: input.groupId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      location: input.location,
      cutoffAt: input.cutoffAt,
      minPlayers: input.minPlayers ?? 1,
      maxPlayers: input.maxPlayers,
      totalCostCents: input.totalCostCents,
      costBreakdown: input.costBreakdown,
      pricingMode: input.pricingMode,
      cashAllowed: input.cashAllowed ?? false,
      autoChargeAtCutoff: input.autoChargeAtCutoff ?? true,
    },
  });

  // §9 "New event posted" → group members, after the event is saved.
  const members = await db.groupMembership.findMany({
    where: { groupId: input.groupId, userId: { not: input.organizerId } },
    select: { userId: true },
  });
  await notifyUsers(db, {
    userIds: members.map((member) => member.userId),
    message: notificationRules.newEventMessage(event, group.name),
  });

  return event;
}
