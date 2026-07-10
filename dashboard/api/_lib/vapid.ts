import webpush, { WebPushError } from "web-push";
import { query } from "./db.js";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set");
  }
  // Subject must be a mailto: or https: URL per the VAPID spec — push services use it to
  // contact the sender if a subscription is misbehaving. A placeholder is fine; it's never
  // shown to the end user.
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@example.invalid";
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function getVapidPublicKey(): string {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) throw new Error("VAPID_PUBLIC_KEY is not set");
  return key;
}

interface StoredSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Sends to every stored subscription. A 404/410 from the push service means that
 * subscription is dead (browser uninstalled, permission revoked, PWA reinstalled on iOS —
 * see PLAN.md's note on that quirk) — those are cleaned up automatically rather than
 * accumulating forever and being retried on every future notification.
 */
export async function sendPushToAllSubscriptions(payload: { title: string; body: string }): Promise<void> {
  ensureConfigured();
  const subs = await query<StoredSubscription>(`SELECT endpoint, p256dh, auth FROM push_subscriptions`);
  const staleEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        if (err instanceof WebPushError && (err.statusCode === 404 || err.statusCode === 410)) {
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error("push send failed for", sub.endpoint, err);
        }
      }
    }),
  );

  if (staleEndpoints.length > 0) {
    await query(`DELETE FROM push_subscriptions WHERE endpoint = ANY($1::text[])`, [staleEndpoints]);
  }
}
