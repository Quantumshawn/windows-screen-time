import type { Context } from "hono";
import { deleteSetting, getSetting, setSetting } from "../_lib/settings.js";

/** GET /api/v1/settings */
export async function handleGetSettings(c: Context) {
  const raw = await getSetting("dailyLimitMinutes");
  return c.json({ dailyLimitMinutes: raw !== null ? Number(raw) : null });
}

/** PUT /api/v1/settings — { dailyLimitMinutes: number | null }. null clears the limit. */
export async function handlePutSettings(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!body || !("dailyLimitMinutes" in body)) {
    return c.json({ error: "expected { dailyLimitMinutes: number | null }" }, 400);
  }

  const { dailyLimitMinutes } = body;
  if (dailyLimitMinutes === null) {
    await deleteSetting("dailyLimitMinutes");
  } else if (typeof dailyLimitMinutes === "number" && dailyLimitMinutes > 0) {
    await setSetting("dailyLimitMinutes", String(dailyLimitMinutes));
  } else {
    return c.json({ error: "dailyLimitMinutes must be a positive number or null" }, 400);
  }

  return c.json({ dailyLimitMinutes });
}
