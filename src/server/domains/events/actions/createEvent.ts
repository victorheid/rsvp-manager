import { TRPCError } from "@trpc/server";
import type { Db } from "@/server/db";
import { PricingMode } from "@/generated/prisma/enums";
import { slugify } from "@/server/domains/groups/rules";

export interface CreateEventInput {
  groupId: string;
  title: string;
  description?: string;
  startsAt: Date;
  location: string;
  cutoffAt: Date;
  minPlayers?: number;
  maxPlayers?: number;
  totalCostCents: number;
  pricingMode: PricingMode;
  cashAllowed?: boolean;
  autoChargeAtCutoff?: boolean;
}

/**
 * Creates an event within a group (§2). Slug uniqueness is scoped
 * globally (public /e/{slug} links), so we suffix on collision rather than
 * failing the whole create.
 */
export async function createEvent(db: Db, input: CreateEventInput) {
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

  return db.event.create({
    data: {
      slug,
      groupId: input.groupId,
      title: input.title,
      description: input.description,
      startsAt: input.startsAt,
      location: input.location,
      cutoffAt: input.cutoffAt,
      minPlayers: input.minPlayers ?? 1,
      maxPlayers: input.maxPlayers,
      totalCostCents: input.totalCostCents,
      pricingMode: input.pricingMode,
      cashAllowed: input.cashAllowed ?? false,
      autoChargeAtCutoff: input.autoChargeAtCutoff ?? true,
    },
  });
}
