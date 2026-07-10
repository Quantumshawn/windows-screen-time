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

app.get("/cron/rollup", requireCronSecret, handleRollup);
