import type { Context } from "hono";
import { applyBuiltInAppRules } from "../_lib/appRules.js";
import { query } from "../_lib/db.js";

interface AppRow {
  exe: string;
  display_name: string;
  category_id: number | null;
  hidden: boolean;
}

interface PatchAppBody {
  displayName?: string;
  categoryId?: number | null;
  hidden?: boolean;
}

/** GET /api/v1/apps — visible apps only (uncategorized-first). Hidden system noise is omitted. */
export async function handleGetApps(c: Context) {
  await applyBuiltInAppRules();
  const rows = await query<AppRow>(
    `SELECT exe, display_name, category_id, COALESCE(hidden, FALSE) AS hidden
     FROM apps
     WHERE COALESCE(hidden, FALSE) = FALSE
     ORDER BY category_id NULLS FIRST, display_name`,
  );
  return c.json({
    apps: rows.map((r) => ({
      exe: r.exe,
      displayName: r.display_name,
      categoryId: r.category_id,
      hidden: r.hidden,
    })),
  });
}

/** PATCH /api/v1/apps/:exe — rename, (re)assign category, and/or hide. */
export async function handlePatchApp(c: Context) {
  const exe = c.req.param("exe");
  const body = await c.req.json<PatchAppBody>().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid body" }, 400);
  }

  const sets: string[] = [];
  const values: unknown[] = [exe];

  if (typeof body.displayName === "string" && body.displayName.trim()) {
    values.push(body.displayName.trim());
    sets.push(`display_name = $${values.length}`);
  }
  if ("categoryId" in body) {
    if (body.categoryId !== null && typeof body.categoryId !== "number") {
      return c.json({ error: "categoryId must be a number or null" }, 400);
    }
    values.push(body.categoryId);
    sets.push(`category_id = $${values.length}`);
  }
  if (typeof body.hidden === "boolean") {
    values.push(body.hidden);
    sets.push(`hidden = $${values.length}`);
  }
  if (sets.length === 0) {
    return c.json({ error: "nothing to update: provide displayName, categoryId, and/or hidden" }, 400);
  }

  const rows = await query<AppRow>(
    `UPDATE apps SET ${sets.join(", ")} WHERE exe = $1
     RETURNING exe, display_name, category_id, COALESCE(hidden, FALSE) AS hidden`,
    values,
  );
  if (rows.length === 0) {
    return c.json({ error: "app not found" }, 404);
  }
  const row = rows[0];
  return c.json({
    exe: row.exe,
    displayName: row.display_name,
    categoryId: row.category_id,
    hidden: row.hidden,
  });
}
