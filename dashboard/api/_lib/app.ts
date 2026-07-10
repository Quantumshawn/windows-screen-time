import { Hono } from "hono";
import { requireToken } from "./auth.js";
import { handlePostSlices } from "../routes/slices.js";
import { handleGetSummary } from "../routes/summary.js";

export const app = new Hono().basePath("/api");

app.get("/v1/health", (c) => c.json({ ok: true }));

app.post("/v1/slices", requireToken("DEVICE_TOKEN"), handlePostSlices);
app.get("/v1/summary", requireToken("DASHBOARD_TOKEN"), handleGetSummary);
