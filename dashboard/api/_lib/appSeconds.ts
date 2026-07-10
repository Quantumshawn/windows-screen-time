import { query } from "./db.js";
import { UNCATEGORIZED_COLOR, type AppSecondsWithCategory } from "./categorize.js";

interface AppSecondsRow {
  exe: string;
  display_name: string;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  seconds: string;
}

/**
 * Per-app seconds of overlap between each slice and [fromTs, toTs), left-joined with
 * category info. Category is resolved at read time (not baked into daily_rollups), so
 * re-categorizing an app immediately updates how *all* history reads — past and present —
 * rather than leaving old days frozen at whatever assignment existed when they were rolled up.
 */
export async function queryAppSecondsInWindow(fromTs: number, toTs: number): Promise<AppSecondsWithCategory[]> {
  const rows = await query<AppSecondsRow>(
    `SELECT
       s.exe,
       COALESCE(a.display_name, s.exe) AS display_name,
       a.category_id,
       c.name AS category_name,
       c.color AS category_color,
       SUM(GREATEST(0, LEAST(s.end_ts, $2) - GREATEST(s.start_ts, $1))) AS seconds
     FROM slices s
     LEFT JOIN apps a ON a.exe = s.exe
     LEFT JOIN categories c ON c.id = a.category_id
     WHERE s.end_ts > $1 AND s.start_ts < $2
     GROUP BY s.exe, a.display_name, a.category_id, c.name, c.color
     ORDER BY seconds DESC`,
    [fromTs, toTs],
  );

  return rows.map(mapRow);
}

/**
 * Same shape as above but from daily_rollups across a whole date range in one round trip
 * (not one query per day — a 30-day month view would otherwise mean 30 sequential queries).
 * Returns rows tagged with their date so the caller groups them.
 */
export async function queryAppSecondsByRollupRange(
  fromDate: string,
  toDate: string,
  excludeDate: string,
): Promise<(AppSecondsWithCategory & { date: string })[]> {
  const rows = await query<AppSecondsRow & { date: string }>(
    `SELECT
       dr.date,
       dr.exe,
       COALESCE(a.display_name, dr.exe) AS display_name,
       a.category_id,
       c.name AS category_name,
       c.color AS category_color,
       dr.seconds::text AS seconds
     FROM daily_rollups dr
     LEFT JOIN apps a ON a.exe = dr.exe
     LEFT JOIN categories c ON c.id = a.category_id
     WHERE dr.date >= $1 AND dr.date <= $2 AND dr.date != $3
     ORDER BY dr.date`,
    [fromDate, toDate, excludeDate],
  );

  return rows.map((r) => ({ ...mapRow(r), date: r.date }));
}

/** Just the total, no per-app grouping — for the daily-limit check, which only needs one number. */
export async function queryTotalSecondsInWindow(fromTs: number, toTs: number): Promise<number> {
  const rows = await query<{ total: string | null }>(
    `SELECT SUM(GREATEST(0, LEAST(end_ts, $2) - GREATEST(start_ts, $1))) AS total
     FROM slices
     WHERE end_ts > $1 AND start_ts < $2`,
    [fromTs, toTs],
  );
  return Number(rows[0]?.total ?? 0);
}

function mapRow(r: AppSecondsRow): AppSecondsWithCategory {
  return {
    exe: r.exe,
    displayName: r.display_name,
    categoryId: r.category_id,
    categoryName: r.category_name ?? "Uncategorized",
    categoryColor: r.category_color ?? UNCATEGORIZED_COLOR,
    seconds: Number(r.seconds),
  };
}
