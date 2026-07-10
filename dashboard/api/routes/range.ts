import type { Context } from "hono";
import { queryAppSecondsByRollupRange, queryAppSecondsInWindow } from "../_lib/appSeconds.js";
import { summarizeByCategory, type AppSecondsWithCategory, type CategorySeconds } from "../_lib/categorize.js";
import { dayBoundariesUtc, localDateString } from "../_lib/time.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface DayBreakdown {
  date: string;
  totalSeconds: number;
  apps: AppSecondsWithCategory[];
  categories: CategorySeconds[];
}

function emptyDay(date: string): DayBreakdown {
  return { date, totalSeconds: 0, apps: [], categories: [] };
}

/**
 * GET /api/v1/range?from=YYYY-MM-DD&to=YYYY-MM-DD — per-day, per-app, per-category totals
 * for charts. Days before today are read from daily_rollups (materialized by the nightly
 * cron); today itself is never in the rollup table yet, so it's computed live from `slices`
 * the same way the summary endpoint does, keeping the current day's numbers current within
 * the request.
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
    days.set(dateStr, emptyDay(dateStr));
  }

  const rollupRows = await queryAppSecondsByRollupRange(from, to, todayStr);
  const byDate = new Map<string, AppSecondsWithCategory[]>();
  for (const row of rollupRows) {
    const { date, ...app } = row;
    const list = byDate.get(date) ?? [];
    list.push(app);
    byDate.set(date, list);
  }
  for (const [date, apps] of byDate) {
    const day = days.get(date);
    if (!day) continue; // defensive: every date in range was pre-seeded above
    day.apps = apps;
    day.categories = summarizeByCategory(apps);
    day.totalSeconds = apps.reduce((sum, a) => sum + a.seconds, 0);
  }

  if (todayStr >= from && todayStr <= to) {
    const { start, end } = await dayBoundariesUtc(todayStr, tz);
    const apps = await queryAppSecondsInWindow(start, end);
    days.set(todayStr, {
      date: todayStr,
      totalSeconds: apps.reduce((sum, a) => sum + a.seconds, 0),
      apps,
      categories: summarizeByCategory(apps),
    });
  }

  const sortedDays = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  return c.json({ from, to, days: sortedDays });
}
