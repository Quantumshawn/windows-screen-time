// Local API dev server — no Vercel account or real Postgres needed.
//
// Runs the exact same Hono app (api/_lib/app.ts) that gets deployed to Vercel, just served
// via @hono/node-server instead of the Vercel adapter. The only thing that differs between
// this and production is what DATABASE_URL points to: here, an in-process PGlite instance
// (real Postgres, compiled to WASM) exposed over a local TCP socket so the same `pg` driver
// code path is exercised in both places.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8787;
const PG_SOCKET_PORT = 55432;

async function main() {
  const db = new PGlite();
  const socketServer = new PGLiteSocketServer({ db, port: PG_SOCKET_PORT, host: "127.0.0.1", maxConnections: 10 });
  await socketServer.start();
  console.log(`[dev] PGlite listening on postgres://127.0.0.1:${PG_SOCKET_PORT}`);

  const schema = readFileSync(path.join(__dirname, "db", "schema.sql"), "utf-8");
  await db.exec(schema);
  console.log("[dev] schema applied");

  process.env.DATABASE_URL = `postgres://postgres@127.0.0.1:${PG_SOCKET_PORT}/postgres`;
  process.env.DEVICE_TOKEN ??= "dev-device-token";
  process.env.DASHBOARD_TOKEN ??= "dev-dashboard-token";
  // Dev-only VAPID keypair — production must generate its own (`npx web-push generate-vapid-keys`
  // or webpush.generateVAPIDKeys()) rather than reusing keys that have appeared in a repo/transcript.
  process.env.VAPID_PUBLIC_KEY ??=
    "BMFkJGjp-jF2yO6gwx90-d4k9mNKQvvIT29xVIC1tTl1KLG__FMLBnND6NP8j3TYIHAiCXyA2Kss9JwlaMXB9IY";
  process.env.VAPID_PRIVATE_KEY ??= "5Eubiw9WPUf9RZ0AMRxcjMDabIREveBWskdxfAfvX6Q";

  // Dynamic import so DATABASE_URL is set before the app (and its lazy db pool) ever loads.
  const { app } = await import("./api/_lib/app.js");

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`[dev] API listening on http://127.0.0.1:${info.port}`);
    console.log(`[dev] DEVICE_TOKEN=${process.env.DEVICE_TOKEN}`);
    console.log(`[dev] DASHBOARD_TOKEN=${process.env.DASHBOARD_TOKEN}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
