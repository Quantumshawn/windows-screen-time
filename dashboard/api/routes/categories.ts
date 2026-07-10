import type { Context } from "hono";
import { query } from "../_lib/db.js";

interface CategoryRow {
  id: number;
  name: string;
  color: string;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** GET /api/v1/categories */
export async function handleGetCategories(c: Context) {
  const rows = await query<CategoryRow>(`SELECT id, name, color FROM categories ORDER BY id`);
  return c.json({ categories: rows });
}

/** POST /api/v1/categories — { name, color } where color is a "#rrggbb" hex string. */
export async function handlePostCategory(c: Context) {
  const body = await c.req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const color = typeof body?.color === "string" ? body.color : "";
  if (!name || !HEX_COLOR_RE.test(color)) {
    return c.json({ error: "name (non-empty) and color (#rrggbb hex) are required" }, 400);
  }

  const rows = await query<CategoryRow>(
    `INSERT INTO categories (name, color) VALUES ($1, $2) RETURNING id, name, color`,
    [name, color],
  );
  return c.json(rows[0], 201);
}

/** PATCH /api/v1/categories/:id — rename and/or recolor. Omitted fields are untouched. */
export async function handlePatchCategory(c: Context) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: "invalid category id" }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const sets: string[] = [];
  const values: unknown[] = [id];

  if (typeof body?.name === "string" && body.name.trim()) {
    values.push(body.name.trim());
    sets.push(`name = $${values.length}`);
  }
  if (typeof body?.color === "string") {
    if (!HEX_COLOR_RE.test(body.color)) {
      return c.json({ error: "color must be a #rrggbb hex string" }, 400);
    }
    values.push(body.color);
    sets.push(`color = $${values.length}`);
  }
  if (sets.length === 0) {
    return c.json({ error: "nothing to update: provide name and/or color" }, 400);
  }

  const rows = await query<CategoryRow>(
    `UPDATE categories SET ${sets.join(", ")} WHERE id = $1 RETURNING id, name, color`,
    values,
  );
  if (rows.length === 0) {
    return c.json({ error: "category not found" }, 404);
  }
  return c.json(rows[0]);
}

/** DELETE /api/v1/categories/:id — apps assigned to it fall back to Uncategorized (schema ON DELETE SET NULL). */
export async function handleDeleteCategory(c: Context) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) {
    return c.json({ error: "invalid category id" }, 400);
  }
  await query(`DELETE FROM categories WHERE id = $1`, [id]);
  return c.json({ ok: true });
}
