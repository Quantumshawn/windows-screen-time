import { query } from "./db.js";

export async function getSetting(key: string): Promise<string | null> {
  const rows = await query<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function deleteSetting(key: string): Promise<void> {
  await query(`DELETE FROM settings WHERE key = $1`, [key]);
}
