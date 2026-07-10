import type { Context } from "hono";
import { query } from "../_lib/db.js";

interface AppRow {
  exe: string;
  display_name: string;
  category_id: number | null;
}

interface PatchAppBody {
  displayName?: string;
  categoryId?: number | null;
}

/** GET /api/v1/apps — every app seen so far, uncategorized-first so new apps are easy to file. */
export async function handleGetApps(c: Context) {
  const rows = await query<AppRow>(
    `SELECT exe, display_name, category_id FROM apps ORDER BY category_id NULLS FIRST, display_name`,
  );
  return c.json({
    apps: rows.map((r) => ({ exe: r.exe, displayName: r.display_name, categoryId: r.category_id })),
  });
}

/** PATCH /api/v1/apps/:exe — rename and/or (re)assign category. Omitted fields are untouched. */
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
  if (sets.length === 0) {
    return c.json({ error: "nothing to update: provide displayName and/or categoryId" }, 400);
  }

  const rows = await query<AppRow>(
    `UPDATE apps SET ${sets.join(", ")} WHERE exe = $1 RETURNING exe, display_name, category_id`,
    values,
  );
  if (rows.length === 0) {
    return c.json({ error: "app not found" }, 404);
  }
  const row = rows[0];
  return c.json({ exe: row.exe, displayName: row.display_name, categoryId: row.category_id });
}
