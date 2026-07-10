import { query } from "./db.js";

/** The local calendar date (YYYY-MM-DD) for `when` in the given IANA timezone. */
export function localDateString(when: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    when,
  );
}

/**
 * Yesterday's local calendar date in `tz`, computed via pure calendar arithmetic (not by
 * subtracting 24 wall-clock hours from a real instant) so it's unaffected by DST transitions.
 */
export function yesterdayDateString(tz: string): string {
  const [y, m, d] = localDateString(new Date(), tz).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * The UTC epoch-second boundaries of local midnight-to-midnight for `dateStr` in `tz`.
 * Delegates to Postgres's `AT TIME ZONE`, which carries a full IANA tzdata database — far more
 * robust than hand-rolling DST-aware offset math in JS.
 */
export async function dayBoundariesUtc(dateStr: string, tz: string): Promise<{ start: number; end: number }> {
  const rows = await query<{ start: string; end: string }>(
    `SELECT
       EXTRACT(EPOCH FROM ($1::date)::timestamp AT TIME ZONE $2)::bigint AS start,
       EXTRACT(EPOCH FROM ($1::date + interval '1 day')::timestamp AT TIME ZONE $2)::bigint AS end`,
    [dateStr, tz],
  );
  return { start: Number(rows[0].start), end: Number(rows[0].end) };
}
