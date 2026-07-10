import type { Context } from "hono";
import { query } from "../_lib/db.js";
import { getVapidPublicKey } from "../_lib/vapid.js";

interface SubscribeBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** GET /api/v1/push/vapid-public-key — safe to expose publicly; that's the point of VAPID's split. */
export function handleGetVapidPublicKey(c: Context) {
  return c.json({ publicKey: getVapidPublicKey() });
}

/** POST /api/v1/push/subscribe — body is a standard PushSubscription.toJSON(). */
export async function handlePostSubscribe(c: Context) {
  const body = await c.req.json<SubscribeBody>().catch(() => null);
  if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return c.json({ error: "invalid subscription: expected { endpoint, keys: { p256dh, auth } }" }, 400);
  }

  await query(
    `INSERT INTO push_subscriptions (endpoint, p256dh, auth, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO NOTHING`,
    [body.endpoint, body.keys.p256dh, body.keys.auth, Math.floor(Date.now() / 1000)],
  );
  return c.json({ ok: true });
}

/** DELETE /api/v1/push/subscribe — body { endpoint }. */
export async function handleDeleteSubscribe(c: Context) {
  const body = await c.req.json().catch(() => null);
  if (!body?.endpoint) {
    return c.json({ error: "expected { endpoint }" }, 400);
  }
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [body.endpoint]);
  return c.json({ ok: true });
}
