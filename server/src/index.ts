import { Hono } from "hono";
import type { Env } from "./types";
import { requireToken } from "./auth";
import { handlePostSlices } from "./routes/slices";
import { handleGetSummary } from "./routes/summary";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/v1/health", (c) => c.json({ ok: true }));

app.post("/api/v1/slices", requireToken("DEVICE_TOKEN"), handlePostSlices);
app.get("/api/v1/summary", requireToken("DASHBOARD_TOKEN"), handleGetSummary);

export default app;
