import { db } from "@/server/db";
import { DEFAULT_FEE_SCHEDULE } from "@/server/domains/fees/rules";

/** Every test event pins this schedule: `resetDatabase` re-seeds it after truncating. */
export const FEE_SCHEDULE_V1_ID = DEFAULT_FEE_SCHEDULE.id;

/**
 * Truncates every table in the test database. Feature tests call this in
 * `beforeEach` instead of listing tables to delete themselves — a per-file
 * list silently goes stale as the schema grows and breaks on FK order
 * whenever tests from different domains share the same live Postgres
 * instance (CLAUDE.md: feature tests run "against a real Postgres test DB
 * that's reset between tests").
 *
 * Data the migrations seed (fee schedule v1) is put back afterwards, so
 * tests start from what a freshly migrated database has.
 */
export async function resetDatabase(): Promise<void> {
  if (!process.env.VITEST) {
    throw new Error("resetDatabase() only runs under Vitest — it truncates the whole database.");
  }

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length > 0) {
    const tableList = tables.map((table) => `"${table.tablename}"`).join(", ");
    await db.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  }

  await db.feeSchedule.create({
    data: {
      id: DEFAULT_FEE_SCHEDULE.id,
      version: DEFAULT_FEE_SCHEDULE.version,
      effectiveFrom: DEFAULT_FEE_SCHEDULE.effectiveFrom,
      gameCardFeeTiers: DEFAULT_FEE_SCHEDULE.gameCardFeeTiers,
      topUpFeeTiers: DEFAULT_FEE_SCHEDULE.topUpFeeTiers,
    },
  });
}
