import type { Context } from "hono";
import type { Env } from "../types";

interface AppSeconds {
  exe: string;
  seconds: number;
}

/**
 * GET /api/v1/summary?from=<unix>&to=<unix> — total + per-app seconds of overlap between
 * each slice and the requested window. Takes explicit unix-second bounds rather than a
 * calendar date: the Worker has no opinion on timezone, the caller (dashboard, running in
 * the browser) does. Overlap (not whole-slice duration) correctly handles slices that only
 * partially fall inside the window, e.g. a still-open slice or one spanning midnight.
 */
export async function handleGetSummary(c: Context<{ Bindings: Env }>) {
  const from = Number(c.req.query("from"));
  const to = Number(c.req.query("to"));

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return c.json({ error: "from/to query params must be unix seconds with to > from" }, 400);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT exe,
            SUM(MAX(0, MIN(end_ts, ?2) - MAX(start_ts, ?1))) AS seconds
     FROM slices
     WHERE end_ts > ?1 AND start_ts < ?2
     GROUP BY exe
     ORDER BY seconds DESC`,
  )
    .bind(from, to)
    .all<AppSeconds>();

  const totalSeconds = results.reduce((sum, r) => sum + r.seconds, 0);

  return c.json({ from, to, totalSeconds, apps: results });
}
