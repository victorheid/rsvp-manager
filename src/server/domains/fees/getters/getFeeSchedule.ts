import type { Db } from "@/server/db";
import type { FeeScheduleModel } from "@/generated/prisma/models";
import { currentSchedule, feeTiersSchema } from "@/server/domains/fees/rules";

/** A schedule row with its JSON tiers parsed (they come from outside the type system). */
function parseSchedule(row: FeeScheduleModel) {
  return {
    id: row.id,
    version: row.version,
    effectiveFrom: row.effectiveFrom,
    gameCardFeeTiers: feeTiersSchema.parse(row.gameCardFeeTiers),
    topUpFeeTiers: feeTiersSchema.parse(row.topUpFeeTiers),
  };
}

export type FeeSchedule = ReturnType<typeof parseSchedule>;

/** The schedule an event pinned at creation (§5). */
export async function getFeeScheduleById(db: Db, id: string): Promise<FeeSchedule> {
  return parseSchedule(await db.feeSchedule.findUniqueOrThrow({ where: { id } }));
}

/** The schedule in force right now: for new events, and for top-ups (§5). */
export async function getCurrentFeeSchedule(db: Db, now: Date): Promise<FeeSchedule> {
  const rows = await db.feeSchedule.findMany({ where: { effectiveFrom: { lte: now } }, orderBy: { version: "desc" }, take: 1 });
  const row = currentSchedule(rows, now);

  if (!row) {
    throw new Error("No fee schedule is in effect.");
  }

  return parseSchedule(row);
}
