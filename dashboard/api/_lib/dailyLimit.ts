import { queryTotalSecondsInWindow } from "./appSeconds.js";
import { getSetting, setSetting } from "./settings.js";
import { dayBoundariesUtc, localDateString } from "./time.js";
import { sendPushToAllSubscriptions } from "./vapid.js";

/**
 * Called after every slice upload. Fires a push at most once per local day, the moment
 * today's total first crosses the configured limit — not on every upload after that point.
 * Awaited synchronously by the caller (not fire-and-forget): a serverless function's
 * execution can be torn down as soon as its response is sent, so anything not awaited
 * before returning is not guaranteed to actually finish.
 */
export async function checkDailyLimitAndNotify(): Promise<void> {
  const limitRaw = await getSetting("dailyLimitMinutes");
  if (!limitRaw) return; // no limit configured

  const limitSeconds = Number(limitRaw) * 60;
  const tz = process.env.TIMEZONE || "UTC";
  const todayStr = localDateString(new Date(), tz);

  const lastAlertDate = await getSetting("limitAlertSentDate");
  if (lastAlertDate === todayStr) return; // already alerted today

  const { start, end } = await dayBoundariesUtc(todayStr, tz);
  const totalSeconds = await queryTotalSecondsInWindow(start, end);

  if (totalSeconds >= limitSeconds) {
    const totalMinutes = Math.round(totalSeconds / 60);
    await sendPushToAllSubscriptions({
      title: "Daily screen time limit reached",
      body: `You've been active for ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m today.`,
    });
    await setSetting("limitAlertSentDate", todayStr);
  }
}
