import { Hono } from "hono";
import { requireCronSecret, requireToken } from "./auth.js";
import { handlePostSlices } from "../routes/slices.js";
import { handleGetSummary } from "../routes/summary.js";
import { handleGetRange } from "../routes/range.js";
import { handleRollup } from "../routes/rollup.js";
import { handleGetApps, handlePatchApp } from "../routes/apps.js";
import {
  handleDeleteCategory,
  handleGetCategories,
  handlePatchCategory,
  handlePostCategory,
} from "../routes/categories.js";
import { handleGetSettings, handlePutSettings } from "../routes/settings.js";
import { handleDeleteSubscribe, handleGetVapidPublicKey, handlePostSubscribe } from "../routes/push.js";

export const app = new Hono().basePath("/api");

app.get("/v1/health", (c) => c.json({ ok: true }));

app.post("/v1/slices", requireToken("DEVICE_TOKEN"), handlePostSlices);
app.get("/v1/summary", requireToken("DASHBOARD_TOKEN"), handleGetSummary);
app.get("/v1/range", requireToken("DASHBOARD_TOKEN"), handleGetRange);

app.get("/v1/apps", requireToken("DASHBOARD_TOKEN"), handleGetApps);
app.patch("/v1/apps/:exe", requireToken("DASHBOARD_TOKEN"), handlePatchApp);

app.get("/v1/categories", requireToken("DASHBOARD_TOKEN"), handleGetCategories);
app.post("/v1/categories", requireToken("DASHBOARD_TOKEN"), handlePostCategory);
app.patch("/v1/categories/:id", requireToken("DASHBOARD_TOKEN"), handlePatchCategory);
app.delete("/v1/categories/:id", requireToken("DASHBOARD_TOKEN"), handleDeleteCategory);

app.get("/v1/settings", requireToken("DASHBOARD_TOKEN"), handleGetSettings);
app.put("/v1/settings", requireToken("DASHBOARD_TOKEN"), handlePutSettings);

app.get("/v1/push/vapid-public-key", requireToken("DASHBOARD_TOKEN"), handleGetVapidPublicKey);
app.post("/v1/push/subscribe", requireToken("DASHBOARD_TOKEN"), handlePostSubscribe);
app.delete("/v1/push/subscribe", requireToken("DASHBOARD_TOKEN"), handleDeleteSubscribe);

app.get("/cron/rollup", requireCronSecret, handleRollup);
