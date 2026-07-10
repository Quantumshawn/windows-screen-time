import type { Context } from "hono";
import { query } from "../_lib/db.js";
import { dayBoundariesUtc, localDateString } from "../_lib/time.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface DayBreakdown {
  date: string;
  totalSeconds: number;
  apps: { exe: string; seconds: number }[];
}

/**
 * GET /api/v1/range?from=YYYY-MM-DD&to=YYYY-MM-DD — per-day, per-app totals for charts.
 * Days before today are read from daily_rollups (materialized by the nightly cron); today
 * itself is never in the rollup table yet, so it's computed live from `slices` the same way
 * the summary endpoint does, keeping the current day's numbers current within the request.
 */
export async function handleGetRange(c: Context) {
  const from = c.req.query("from");
  const to = c.req.query("to");
  const tz = process.env.TIMEZONE || "UTC";

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return c.json({ error: "from/to query params must be YYYY-MM-DD with to >= from" }, 400);
  }

  const todayStr = localDateString(new Date(), tz);
  const days = new Map<string, DayBreakdown>();

  // Pre-seed every date in the range so a zero-activity day (PC off all day) still
  // renders as a zero bar instead of silently vanishing and compressing the x-axis.
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    days.set(dateStr, { date: dateStr, totalSeconds: 0, apps: [] });
  }

  const rollupRows = await query<{ date: string; exe: string; seconds: string }>(
    `SELECT date, exe, seconds FROM daily_rollups WHERE date >= $1 AND date <= $2 AND date != $3 ORDER BY date`,
    [from, to, todayStr],
  );
  for (const row of rollupRows) {
    const day = days.get(row.date);
    if (!day) continue; // defensive: every date in range was pre-seeded above
    const seconds = Number(row.seconds);
    day.apps.push({ exe: row.exe, seconds });
    day.totalSeconds += seconds;
  }

  if (todayStr >= from && todayStr <= to) {
    const { start, end } = await dayBoundariesUtc(todayStr, tz);
    const liveRows = await query<{ exe: string; seconds: string }>(
      `SELECT exe, SUM(GREATEST(0, LEAST(end_ts, $2) - GREATEST(start_ts, $1))) AS seconds
       FROM slices
       WHERE end_ts > $1 AND start_ts < $2
       GROUP BY exe`,
      [start, end],
    );
    const apps = liveRows.map((r) => ({ exe: r.exe, seconds: Number(r.seconds) }));
    days.set(todayStr, { date: todayStr, totalSeconds: apps.reduce((sum, a) => sum + a.seconds, 0), apps });
  }

  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return c.json({ from, to, days: sortedDays });
}
