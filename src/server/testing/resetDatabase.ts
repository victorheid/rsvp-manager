import { db } from "@/server/db";

/**
 * Truncates every table in the test database. Feature tests call this in
 * `beforeEach` instead of listing tables to delete themselves — a per-file
 * list silently goes stale as the schema grows and breaks on FK order
 * whenever tests from different domains share the same live Postgres
 * instance (CLAUDE.md: feature tests run "against a real Postgres test DB
 * that's reset between tests").
 */
export async function resetDatabase(): Promise<void> {
  if (!process.env.VITEST) {
    throw new Error("resetDatabase() only runs under Vitest — it truncates the whole database.");
  }

  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableList = tables.map((table) => `"${table.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
}
