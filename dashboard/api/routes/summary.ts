import type { Context } from "hono";
import { queryAppSecondsInWindow } from "../_lib/appSeconds.js";
import { summarizeByCategory } from "../_lib/categorize.js";

/**
 * GET /api/v1/summary?from=<unix>&to=<unix> — total + per-app + per-category seconds of
 * overlap between each slice and the requested window. Takes explicit unix-second bounds
 * rather than a calendar date: the API has no opinion on timezone, the caller (dashboard,
 * running in the browser) does.
 */
export async function handleGetSummary(c: Context) {
  const from = Number(c.req.query("from"));
  const to = Number(c.req.query("to"));

  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return c.json({ error: "from/to query params must be unix seconds with to > from" }, 400);
  }

  const apps = await queryAppSecondsInWindow(from, to);
  const categories = summarizeByCategory(apps);
  const totalSeconds = apps.reduce((sum, a) => sum + a.seconds, 0);

  return c.json({ from, to, totalSeconds, apps, categories });
}
