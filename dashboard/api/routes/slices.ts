import type { Context } from "hono";
import { query } from "../_lib/db.js";

interface IncomingSlice {
  id: string;
  exe: string;
  displayName?: string;
  start: number;
  end: number;
}

interface SlicesRequestBody {
  deviceId: string;
  slices: IncomingSlice[];
}

const MAX_CLOCK_SKEW_SEC = 5 * 60;

function isValidSlice(s: unknown, nowSec: number): s is IncomingSlice {
  if (typeof s !== "object" || s === null) return false;
  const slice = s as Partial<IncomingSlice>;
  return (
    typeof slice.id === "string" &&
    slice.id.length > 0 &&
    typeof slice.exe === "string" &&
    slice.exe.length > 0 &&
    typeof slice.start === "number" &&
    Number.isFinite(slice.start) &&
    typeof slice.end === "number" &&
    Number.isFinite(slice.end) &&
    slice.end >= slice.start &&
    slice.end <= nowSec + MAX_CLOCK_SKEW_SEC
  );
}

/** POST /api/v1/slices — batch upsert, keyed by client-generated slice id (idempotent). */
export async function handlePostSlices(c: Context) {
  const body = await c.req.json<SlicesRequestBody>().catch(() => null);
  if (!body || !body.deviceId || !Array.isArray(body.slices)) {
    return c.json({ error: "invalid body: expected { deviceId, slices[] }" }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const valid = body.slices.filter((s) => isValidSlice(s, nowSec));

  if (valid.length === 0) {
    return c.json({ accepted: 0 });
  }

  const values: unknown[] = [];
  const placeholders = valid.map((s, i) => {
    const base = i * 5;
    values.push(s.id, body.deviceId, s.exe, s.start, s.end);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await query(
    `INSERT INTO slices (id, device_id, exe, start_ts, end_ts)
     VALUES ${placeholders.join(", ")}
     ON CONFLICT (id) DO UPDATE SET end_ts = excluded.end_ts`,
    values,
  );

  return c.json({ accepted: valid.length });
}
