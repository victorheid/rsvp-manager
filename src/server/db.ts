import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Falls back to an obviously-fake URL so importing this module never
// throws (e.g. when collecting DB-less unit test files); any real query
// against it fails loudly instead. Copy .env.example to .env for real use.
const connectionString =
  process.env.DATABASE_URL ?? "postgresql://unset:unset@localhost:5432/unset";

const adapter = new PrismaPg({ connectionString });

// Reuse the client across hot reloads in dev so we don't exhaust Postgres
// connections. See https://pris.ly/d/help/next-js-best-practices
declare global {
  var __prisma: PrismaClient | undefined;
}

export const db = globalThis.__prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}

/**
 * Accepted by every action so a caller can pass either the top-level
 * client or a transaction client through unchanged (CLAUDE.md: "An action
 * that affects another domain calls that domain's action... and passes
 * the transaction client through").
 */
export type Db = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$use" | "$extends">;
