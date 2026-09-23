import type { Db } from "@/server/db";
import { feeTiersSchema, type FeeTiers } from "@/server/domains/fees/rules";

export interface PublishFeeScheduleInput {
  effectiveFrom: Date;
  gameCardFeeTiers: FeeTiers;
  topUpFeeTiers: FeeTiers;
}

/**
 * Publishes a new fee schedule version (§5). Schedules are never edited in
 * place: existing ones stay exactly as they were, so events pinned to them
 * keep their fees. No router — changing fees is an operator action, run
 * from a script or the database console, not something users trigger.
 */
export async function publishFeeSchedule(db: Db, input: PublishFeeScheduleInput) {
  const gameCardFeeTiers = feeTiersSchema.parse(input.gameCardFeeTiers);
  const topUpFeeTiers = feeTiersSchema.parse(input.topUpFeeTiers);

  // A game payment can be any amount, so its last tier must be open-ended.
  if (gameCardFeeTiers[gameCardFeeTiers.length - 1]?.upToCents !== null) {
    throw new Error("Game card fee tiers must end with an open-ended tier.");
  }

  return db.$transaction(async (tx) => {
    const latest = await tx.feeSchedule.findFirst({ orderBy: { version: "desc" } });

    return tx.feeSchedule.create({
      data: { version: (latest?.version ?? 0) + 1, effectiveFrom: input.effectiveFrom, gameCardFeeTiers, topUpFeeTiers },
    });
  });
}
