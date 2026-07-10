import type { Context } from "hono";
import { query } from "../_lib/db.js";
import { dayBoundariesUtc, yesterdayDateString } from "../_lib/time.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/cron/rollup[?date=YYYY-MM-DD] — materializes one local calendar day's per-app
 * totals into daily_rollups. Defaults to "yesterday" (the nightly-cron case); accepts an
 * explicit date for manual backfill/testing. Idempotent — safe to re-run for any date.
 */
export async function handleRollup(c: Context) {
  const tz = process.env.TIMEZONE || "UTC";
  const dateParam = c.req.query("date");
  if (dateParam && !DATE_RE.test(dateParam)) {
    return c.json({ error: "date must be YYYY-MM-DD" }, 400);
  }
  const dateStr = dateParam ?? yesterdayDateString(tz);

  const { start, end } = await dayBoundariesUtc(dateStr, tz);

  await query(
    `INSERT INTO daily_rollups (date, exe, seconds)
     SELECT $3, exe, SUM(GREATEST(0, LEAST(end_ts, $2) - GREATEST(start_ts, $1)))
     FROM slices
     WHERE end_ts > $1 AND start_ts < $2
     GROUP BY exe
     ON CONFLICT (date, exe) DO UPDATE SET seconds = excluded.seconds`,
    [start, end, dateStr],
  );

  return c.json({ ok: true, date: dateStr, tz });
}
