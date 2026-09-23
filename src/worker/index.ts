import { db } from "@/server/db";
import { autoConfirmDueEvents, expireOverdueEvents } from "@/server/domains/events";

/**
 * Background worker for time-based jobs (specs/tasks.md §0, §3, §7):
 * cut-off auto-confirm and event expiry. Payout release will join this
 * once §5 exists. Run with `pnpm worker` — a single always-on process is
 * enough at this scale; move to a real scheduler (Vercel Cron, a queue)
 * before running more than one instance.
 */
const TICK_MS = 60_000;

async function tick() {
  const now = new Date();

  const confirmed = await autoConfirmDueEvents(db, now);
  if (confirmed.length > 0) {
    console.log(`[worker] confirmed ${confirmed.length} event(s): ${confirmed.map((e) => e.slug).join(", ")}`);
  }

  const expired = await expireOverdueEvents(db, now);
  if (expired.length > 0) {
    console.log(`[worker] expired ${expired.length} event(s): ${expired.map((e) => e.slug).join(", ")}`);
  }
}

console.log(`[worker] started, ticking every ${TICK_MS / 1000}s`);
tick().catch((error: unknown) => console.error("[worker] tick failed", error));
setInterval(() => {
  tick().catch((error: unknown) => console.error("[worker] tick failed", error));
}, TICK_MS);
