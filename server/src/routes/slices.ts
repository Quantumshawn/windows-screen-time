import type { Context } from "hono";
import type { Env } from "../types";

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
export async function handlePostSlices(c: Context<{ Bindings: Env }>) {
  const body = await c.req.json<SlicesRequestBody>().catch(() => null);
  if (!body || !body.deviceId || !Array.isArray(body.slices)) {
    return c.json({ error: "invalid body: expected { deviceId, slices[] }" }, 400);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const valid = body.slices.filter((s) => isValidSlice(s, nowSec));

  if (valid.length === 0) {
    return c.json({ accepted: 0 });
  }

  const stmt = c.env.DB.prepare(
    `INSERT INTO slices (id, device_id, exe, start_ts, end_ts)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET end_ts = excluded.end_ts`,
  );

  await c.env.DB.batch(valid.map((s) => stmt.bind(s.id, body.deviceId, s.exe, s.start, s.end)));

  return c.json({ accepted: valid.length });
}
