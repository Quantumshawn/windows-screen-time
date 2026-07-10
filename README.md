# ScreenTime

A Windows background agent that measures *active* PC time — real keyboard/mouse
input only, so sitting AFK in a game doesn't count — and syncs it to a small
Vercel-hosted backend with an installable iPhone dashboard (today's usage,
history, per-app categories, a daily limit with push notifications).

See [PLAN.md](PLAN.md) for the full architecture, every design decision and why,
and phase-by-phase build notes.

## Layout

| Path | What it is |
|---|---|
| [`agent/`](agent/) | The Windows tracker — C# / .NET 8, publishes to a single `.exe` |
| [`dashboard/`](dashboard/) | Everything on Vercel: the API (`api/`, Hono on Vercel Functions) and the PWA dashboard (`src/`, React + Vite) |
| [`scripts/`](scripts/) | `gen_icons.py` — regenerates the PWA icons and the agent's tray `.ico` from one hand-rolled source of truth |

## Running the agent

```
cd agent
dotnet publish -c Release
```

Produces one self-contained `ScreenTimeAgent.exe` (no .NET install required on
the target machine) at `agent/bin/Release/net8.0-windows/win-x64/publish/`.

On first launch it writes `%APPDATA%\ScreenTime\config.json` — fill in `ApiUrl`
(your Vercel deployment's base URL) and `DeviceToken` (matching the backend's
`DEVICE_TOKEN`) to start syncing; leave them blank to track locally only. The
agent lives in the system tray: right-click for **Open Dashboard**, **Start
with Windows**, and **Exit**. Logs rotate daily under
`%LOCALAPPDATA%\ScreenTime\logs\`, kept for 14 days.

## Deploying the dashboard

The `dashboard/` folder is the Vercel project root (it serves both the static
PWA and the `/api` routes from one origin — no CORS to configure). Deploy it to
Vercel, add a Postgres database from Vercel's Storage/Marketplace tab (or any
external free-tier Postgres — `DATABASE_URL` is all it needs), run
`dashboard/db/schema.sql` against it once, and set these environment variables:

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `DEVICE_TOKEN` | yes | Bearer token the Windows agent authenticates with |
| `DASHBOARD_TOKEN` | yes | Bearer token the PWA authenticates with |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | yes, for push | Generate with `npx web-push generate-vapid-keys` — don't reuse the dev keys in `dev-server.ts` |
| `VAPID_SUBJECT` | no | `mailto:you@example.com`; defaults to a placeholder, never shown to end users |
| `CRON_SECRET` | recommended | Guards the nightly rollup cron; unset is permissive (fine for local dev only) |
| `TIMEZONE` | recommended | IANA name (e.g. `America/New_York`); defaults to UTC — controls what "today" and day boundaries mean everywhere |

`vercel.json`'s cron schedule is in UTC — adjust `30 0 * * *` if you want the
nightly rollup to land at a specific local time.

## Local development (no Vercel account, no Docker)

```
cd dashboard
npm install
npm run dev:api   # PGlite (real Postgres, WASM) on a local socket + the API
npm run dev       # Vite dev server for the PWA
```
