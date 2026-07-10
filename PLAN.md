# ScreenTime — PC Activity Tracker with iOS Dashboard

**One-line summary:** A Windows background agent (C#) measures *active* time at the PC using real keyboard/mouse input (so AFK-in-Minecraft doesn't count), uploads per-app time slices to a free Vercel backend, and an installable PWA dashboard on your iPhone shows today/history/categories and pushes an alert when you cross your daily limit.

> **Note (updated after Phase 3):** The backend originally shipped on Cloudflare Workers + D1 (fully built and tested — see git history). It was migrated to Vercel + Postgres per a later decision to consolidate everything on one platform. This document reflects the current Vercel architecture throughout.

> **Note (first real production deploy):** Everything worked in local dev (PGlite + `@hono/node-server`) and passed every local build/typecheck, but the actual Vercel deployment 404'd on every `/api/*` route — a category of bug local dev structurally cannot catch, since `vercel dev`/`vercel build` are the only things that reproduce Vercel's real routing behavior. Three distinct, real bugs, found only by actually deploying and by reading `.vercel/output/config.json` directly rather than guessing from symptoms:
> 1. `api/[[...route]].ts` (Next.js's "optional catch-all" bracket convention) wasn't recognized by Vercel's generic zero-config Functions routing at all — zero Functions got built, confirmed by the total absence of a Functions tab on the deployment and empty runtime logs.
> 2. Renaming to the standard single-bracket `api/[...route].ts` got Functions building, but `api/routes/*.ts` (not underscore-prefixed) meant every file in it *also* became its own accidental standalone function — and even after fixing that (renamed to `api/_routes/`, matching the underscore-prefix convention that already correctly excluded `api/_lib/`), the catch-all's own generated routing regex was still `^/api/([^/]+)$` — exactly one path segment, so a real request like `/api/v1/health` (two segments) fell through to an explicit 404 rule sitting right below it in `config.json`.
> 3. Replacing the bracket-filename convention with an explicit `vercel.json` rewrite (`"/api/:path*" → "/api"`) plus a plain `api/index.ts` fixed the routing (verified by reading the generated regex directly — a real multi-segment matcher this time) but uncovered a fourth, different bug: the function now matched correctly but **hung indefinitely** on every request — reproduced identically both on `vercel dev` and on the real deployment, while calling the exact same bundled function code directly via plain Node resolved in ~10ms. Root cause: `hono/vercel`'s `handle(app)` adapter wrapper — Hono's own current docs (confirmed live, since this had drifted since the code was first written) recommend exporting the Hono app instance directly (`export default app`) rather than wrapping it, and Vercel's Node.js runtime apparently has a working native fast-path for that shape but not for `handle()`'s plain wrapped function. Switching fixed it immediately, verified on real production.
>
> Also pinned `"engines": { "node": "22.x" }` in `dashboard/package.json` while investigating (the project had drifted to Vercel's default "latest," 24.x, an unusually new runtime) — didn't end up being the actual root cause of the hang, but kept as a reasonable safeguard against the runtime silently drifting further in the future.

---

## 1. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| iOS delivery | PWA (Add to Home Screen) | No Mac, no Apple account, $0. Push works on iOS 16.4+ when installed to home screen. |
| Tracking granularity | Per-app (exe name), no window titles | "3h Minecraft, 2h Chrome" — no record of *what* you did inside each app. |
| Hosting | Vercel (Hobby, free tier) + a Postgres provider's free tier | $0/month, data reachable when PC is off, one platform for the dashboard + API + cron; database is a separate free-tier signup (Neon/Supabase-class), usually reachable via Vercel's own Storage/Marketplace tab with SSO. |
| AFK threshold | **2 minutes** of no input | Aggressive AFK detection. Reading a long page without touching the mouse *will* trip it — threshold is a config value, easy to change later. |
| Media rule | **Input only (strict)** | Watching YouTube/Netflix without touching input counts as AFK after 2 min. Never over-counts; accepts under-counting video time. A per-app media override can be added later behind a config flag without schema changes. |
| Agent stack | C# / .NET 8 | Single self-contained `.exe`, first-class Win32 access, tray icon, tiny footprint. |
| Backend/dashboard stack | TypeScript: Hono on Vercel Functions (Node.js runtime), React + Vite PWA | One Vercel project (dashboard + `/api` folder) serves both API and static dashboard from the same origin — no CORS. |
| Day-one features | History & charts, daily limit + iOS push, app categories | Multi-PC is **out of scope** but the schema carries a `device_id` everywhere so it costs nothing to add later. |

---

## 2. Architecture

```
┌─────────────────────────────┐
│  Windows PC                 │
│  ┌───────────────────────┐  │      HTTPS (Bearer device token)
│  │ Agent (C# tray app)   │──┼────────────────┐
│  │ · 1s sampling loop    │  │                ▼
│  │ · GetLastInputInfo    │  │   ┌──────────────────────────────┐
│  │ · GetForegroundWindow │  │   │ Vercel project (Hono/TS)     │
│  │ · SQLite offline queue│  │   │ · /api/v1/slices  (POST)     │
│  └───────────────────────┘  │   │ · /api/v1/summary / range    │
└─────────────────────────────┘   │ · settings / categories      │
                                  │ · Web Push (VAPID)           │
                                  │ · Cron: daily rollups        │
                                  │ · serves dashboard (Vite)    │
                                  └──────────┬───────────────────┘
                                             │ Postgres (Neon/Supabase-class)
                                             ▼
                                  ┌──────────────────────────────┐
                                  │ iPhone — installed PWA       │
                                  │ Today · History · Settings   │
                                  │ Push: "Daily limit reached"  │
                                  └──────────────────────────────┘
```

Two deliverables, one repo:

```
screentime/
├── agent/          # C# .NET 8 — Windows tracker (tray app)
├── dashboard/       # One Vercel project: React + Vite + Tailwind PWA, plus:
│   ├── api/         #   Hono API as Vercel Functions ([...route].ts catch-all)
│   ├── db/           #   Postgres schema
│   └── dev-server.ts #   Local API dev server (PGlite — no cloud account needed)
└── PLAN.md
```

---

## 3. Component spec — Windows Agent (`agent/`)

### 3.1 What "active" means (the core algorithm)

The unit of truth is the **slice**: a contiguous interval where you were active and one app held focus. `(id, exe, start, end)`.

Sampling loop, every 1 second:

```
idleMs        = now - GetLastInputInfo()          // system-wide last keyboard/mouse input
cursorMoved   = GetCursorPos() != lastCursorPos   // fallback: some raw-input/DirectInput games
                                                  // don't update GetLastInputInfo; cursor delta
                                                  // catches real presence there (your original idea)
if cursorMoved or idleMs < 1000: lastRealInput = now
active        = (now - lastRealInput < 120s) AND NOT sessionLocked AND NOT suspended
fgExe         = exe name of GetForegroundWindow() → GetWindowThreadProcessId → Process

if active:
    if openSlice exists and openSlice.exe == fgExe → extend openSlice.end = now
    else → close openSlice (if any), open new slice(ulid(), fgExe, now)
else if openSlice exists:
    close openSlice with end = lastRealInput      // retroactive trim: the up-to-2-min tail
                                                  // between your last input and the threshold
                                                  // tripping is NOT counted
```

The **retroactive trim** is the detail that makes the 2-minute threshold honest: when you walk away, the slice ends at your actual last input, not 2 minutes later. So AFK-farming in Minecraft costs you at most 0 extra seconds, not 2 minutes per session.

Why not monitor state: monitors stay on while you're in the kitchen, and turn off on a timer while you're reading. Input recency is what every serious tracker (ActivityWatch, Steam, Discord idle) uses. Monitor/lock state is still consumed as a hard "definitely not active" signal.

### 3.2 Win32 surface (P/Invoke)

| API | Purpose |
|---|---|
| `user32!GetLastInputInfo` | Milliseconds since last system-wide input |
| `user32!GetCursorPos` | Cursor-delta fallback for raw-input games |
| `user32!GetForegroundWindow` + `GetWindowThreadProcessId` | Which app has focus |
| `Process.GetProcessById(pid)` | `ProcessName` (exe); `MainModule.FileVersionInfo.FileDescription` for a friendly display name — **wrap in try/catch**: access to elevated processes throws; fall back to exe name |
| `Microsoft.Win32.SystemEvents.SessionSwitch` | `SessionLock`/`SessionUnlock` → force inactive while locked |
| `Microsoft.Win32.SystemEvents.PowerModeChanged` | `Suspend`/`Resume` → close open slice on suspend at `lastRealInput` |

### 3.3 Offline queue & upload protocol

- Local store: SQLite (`Microsoft.Data.Sqlite`) at `%LOCALAPPDATA%\ScreenTime\queue.db`, table `pending_slices(id TEXT PK, exe, display_name, start_ts, end_ts, closed INT)`.
- Closed slices are appended; the currently open slice is also written every 60s with its growing `end` (this is what makes the dashboard's "Today" view near-live).
- Uploader loop, every 60s: `POST /api/v1/slices` with up to 500 slices. Server **upserts by slice `id`** (client-generated ULID) → retries and re-sends of the open slice are idempotent by construction. On `2xx`, delete closed slices from the queue; the open slice stays until closed + acked.
- Backoff on failure: 60s → 2m → 5m → cap 15m. Queue survives reboots; no data loss if the PC is offline for a week.
- Timestamps: agent sends **UTC epoch seconds**. All day-boundary math happens server-side in your configured timezone.

### 3.4 App shell

- WinForms `ApplicationContext` (no window) hosting a `NotifyIcon` tray icon: status (Active/AFK/time today), **Pause tracking**, Open dashboard, Quit.
- Config: `%APPDATA%\ScreenTime\config.json` — `apiUrl`, `deviceToken`, `idleThresholdSec` (120), `sampleIntervalMs` (1000), `uploadIntervalSec` (60).
- Autostart: `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` entry (simplest, per-user, no admin).
- Publish: `dotnet publish -c Release -r win-x64 -p:PublishSingleFile=true --self-contained` → one exe, no .NET install required.
- Log file with rotation at `%LOCALAPPDATA%\ScreenTime\logs\` for debugging detection issues.

### 3.5 Edge cases the agent must handle

| Case | Behavior |
|---|---|
| Workstation locked (Win+L) | Inactive immediately, regardless of input timer |
| Sleep/hibernate | Close slice at `lastRealInput` on `Suspend`; clean state on `Resume` |
| Fullscreen game with raw input not updating `GetLastInputInfo` | Cursor-delta fallback keeps you active while genuinely playing |
| Elevated (admin) foreground app | Exe name may be unreadable → record as exe name from `ProcessName`, description lookup skipped |
| Slice spanning local midnight | Sent as-is; **server** splits at midnight when rolling up |
| Clock skew / manual clock change | Slices with `end < start` or `end > server_now + 5min` rejected per-slice with a logged warning, not a batch failure |
| PC hard-crash | Open slice's last persisted `end` (≤60s stale) is what survives — worst case loses <60s |

---

## 4. Component spec — Backend (`dashboard/api/`)

**Stack:** Hono (TypeScript) as Vercel Functions, Node.js runtime (needed for a raw TCP Postgres connection — Edge runtime can't do this), Postgres via `pg`, Vercel Cron Jobs, Vercel static hosting for the Vite build. Free tier headroom is enormous at this project's scale (~1,440 uploads/day + dashboard reads) on both Vercel Hobby and any mainstream Postgres free tier.

One practical accepted trade-off of a free-tier Postgres provider: the database may auto-suspend after a period of inactivity, so the first request after a quiet stretch can be visibly slower (a "cold start") while it wakes back up. Not a correctness issue, just a UX blip worth knowing about.

### 4.1 Auth (single user, keep it boring)

Two long random tokens generated at setup, stored as Vercel environment variables:
- `DEVICE_TOKEN` — the agent's Bearer token; can only write slices.
- `DASHBOARD_TOKEN` — entered once in the PWA, kept in `localStorage`; read + settings.

No user accounts, no OAuth, no sessions. If a token leaks, rotate the env var and update the two clients.

### 4.2 API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/v1/slices` | device | Batch upsert `{deviceId, slices:[{id, exe, displayName, start, end}]}`. Upsert by `id`. Also runs the daily-limit check (§4.5). |
| `GET /api/v1/summary?date=YYYY-MM-DD` | dashboard | Total seconds + per-app + per-category breakdown for one local day. Today is computed live from slices; past days from rollups. |
| `GET /api/v1/range?from=&to=&bucket=day` | dashboard | Series for charts (per-day totals, stacked by category). |
| `GET /api/v1/apps` / `PATCH /api/v1/apps/:exe` | dashboard | List seen apps; set display name & category. |
| `GET/PUT /api/v1/settings` | dashboard | `dailyLimitMinutes`, `timezone`, category definitions. |
| `POST /api/v1/push/subscribe` / `DELETE .../subscribe` | dashboard | Store/remove Web Push subscription. |
| `GET /*` | none | Static PWA assets. |

### 4.3 Data model (Postgres)

```sql
CREATE TABLE slices (
  id          TEXT PRIMARY KEY,          -- client-generated id → idempotent upserts
  device_id   TEXT NOT NULL,             -- future multi-PC; hardcode 'desktop' for now
  exe         TEXT NOT NULL,             -- e.g. 'javaw' / 'chrome'
  start_ts    BIGINT NOT NULL,           -- UTC epoch seconds
  end_ts      BIGINT NOT NULL,
  CHECK (end_ts >= start_ts)
);
CREATE INDEX idx_slices_time ON slices(start_ts);

CREATE TABLE apps (
  exe          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,            -- from FileDescription, user-editable
  category_id  INTEGER REFERENCES categories(id)  -- NULL = Uncategorized
);

CREATE TABLE categories (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,                   -- Gaming / Productivity / Browsing / …
  color TEXT NOT NULL                    -- hex, drives chart colors
);

CREATE TABLE daily_rollups (              -- materialized by nightly cron
  date    TEXT NOT NULL,                 -- local date 'YYYY-MM-DD'
  exe     TEXT NOT NULL,
  seconds BIGINT NOT NULL,
  PRIMARY KEY (date, exe)
);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: dailyLimitMinutes, timezone, limitAlertSentDate
```

Note on overlap queries: SQLite's `MIN(a,b)`/`MAX(a,b)` (row-wise, 2-arg form) become Postgres's `LEAST(a,b)`/`GREATEST(a,b)` — different function names for the same operation. Also, `SUM()` over a `BIGINT` column returns `NUMERIC` in Postgres, which the `pg` driver hands back as a **string**, not a number — cast explicitly (`Number(row.seconds)`) before using it in arithmetic or JSON responses.

### 4.4 Cron jobs

- **Nightly (00:30 local):** roll up yesterday's slices into `daily_rollups`, splitting midnight-spanning slices; slices older than 90 days can then be pruned (rollups keep the history forever at ~10 rows/day). Configured via `vercel.json`'s `crons` array. Vercel Hobby (free tier) allows cron jobs but caps invocation frequency to once per day — a nightly rollup fits that exactly; if a more frequent cron is ever needed, that requires a paid Vercel plan.
- **Timezone, for now:** day-boundary math (rollup + the live "today" portion of `/range`) reads a `TIMEZONE` env var (IANA name, e.g. `America/New_York`; defaults to `UTC`), not the `settings.timezone` row sketched in §4.3 — full settings CRUD hasn't been built yet (still Phase 5/6 scope). **Set `TIMEZONE` at deploy time**, and note `vercel.json`'s cron `schedule` is always in **UTC** — `"30 0 * * *"` is a placeholder (00:30 UTC); adjust it to land at ~00:30 in your actual timezone, or just leave it — the rollup is idempotent and only cares about *which* date it's given, not when it runs. When settings CRUD lands, decide then whether `TIMEZONE` moves into the database (editable without a redeploy) or stays an env var — either works, nothing built so far depends on which.
- **Backfill/manual trigger:** `GET /api/cron/rollup?date=YYYY-MM-DD` re-materializes any single day on demand (used for testing; also the recovery path if a scheduled run is ever missed).

### 4.5 Daily-limit push flow

1. Every `POST /slices` recomputes today's total (yesterday's rollup boundary + today's live slices).
2. If `total ≥ dailyLimitMinutes` **and** `limitAlertSentDate != today` → send Web Push to all subscriptions, set `limitAlertSentDate = today` (fires exactly once per day).
3. Latency worst case ≈ agent upload interval = ~60s after crossing the limit. Good enough.

Web Push on Vercel: since API functions run on the Node.js runtime (not Edge), the standard `web-push` npm package works directly — no WebCrypto reimplementation needed (that workaround was specific to Cloudflare Workers, which lacks Node's crypto APIs). Generate one VAPID keypair at setup; store as Vercel environment variables.

---

## 5. Component spec — PWA Dashboard (`dashboard/`)

**Stack:** React 18/19 + Vite + Tailwind. Charts: Recharts (or hand-rolled SVG bars — data is simple). One Vercel project builds and serves the Vite output alongside the co-located `/api` functions → one deploy, one URL, HTTPS for free on `*.vercel.app` (custom domain optional later).

### 5.1 Views

1. **Today** (default): big active-time number, progress ring vs. daily limit, per-app list sorted by time with bars and category colors, per-category donut. Polls `summary` every 60s while open.
2. **History**: week and month stacked-bar charts (stacked by category), tap a day → that day's per-app breakdown, streaks/averages line.
3. **Settings**: dashboard token entry (first run), daily limit, timezone, category CRUD + assign apps to categories (uncategorized apps float to top so new apps are easy to file), enable-notifications button.

### 5.2 PWA / iOS specifics (the fiddly part)

- `manifest.json` with `display: "standalone"`, icons (180px apple-touch-icon), theme color.
- Service worker: cache-first for the app shell, network for `/api/*`, and a `push` event handler that shows the notification.
- iOS Web Push hard requirements: **iOS 16.4+**, app **must be installed to home screen** (Safari tab push doesn't exist on iOS), permission must be requested from a **user tap** (the enable-notifications button), HTTPS.
- Known iOS quirk: deleting and re-adding the PWA invalidates the old subscription — the Settings screen shows subscription status and re-subscribes in one tap.

---

## 6. Build phases (each ends in something you can verify)

**Phase 0 — Scaffolding (~1 evening)**
Repo layout above; generate the two auth tokens + VAPID keys; `dotnet new` the agent project.
*Done when:* local API dev server serves hello-world, agent skeleton compiles.

**Phase 1 — Agent core, offline only (~1–2 evenings)** ← the highest-risk phase, do it first
Sampling loop, slice construction, retroactive trim, SQLite queue, console output. No network.
*Done when:* You AFK in Minecraft for 10 minutes and the log shows the slice closed at your last real input; you alt-tab between apps and slices split correctly; lock screen ends the slice.

**Phase 2 — Ingest pipeline (~1 evening)**
Postgres schema + `POST /slices` + `GET /summary`; agent uploader with backoff; deploy to Vercel (`*.vercel.app`).
*Done when:* `curl` of `/summary` from your phone's browser shows real numbers from today.

**Phase 3 — Dashboard "Today" + PWA install (~1–2 evenings)**
Today view, token entry, manifest + service worker; Add to Home Screen on the iPhone.
*Done when:* Icon on your home screen opens to today's live screen time.

**Phase 4 — History & rollups (~1–2 evenings)** ✅ built
Nightly cron rollups, midnight splitting, `range` endpoint, week/month charts.
*Done when:* Week view shows correct per-day totals after a few days of data.

Chart is a single-series bar (one flat color, no legend) rather than stacked by app: exe names are open-ended cardinality with no natural fixed order, which is exactly what the dataviz method's series-count ladder says *not* to force into a stack — that treatment is right for **categories** (Phase 5's small, fixed, meaningful set), not raw app names. Revisit stacking when categories exist.

Caught only by actually running it (three real bugs, not just review):
- `db/schema.sql` never defined `daily_rollups` — documented in this plan, never in the real migration file. Every rollup call 500'd until seeded with real data exposed it.
- `/range` only returned dates that had matching rows, so an all-zero day (PC off all day) silently vanished from the response instead of showing a zero bar — would have quietly compressed the x-axis.
- The topmost gridline's label had no headroom in the SVG viewBox and rendered clipped — only visible by actually screenshotting the chart, exactly per the dataviz skill's "render it and look at it" step.

**Phase 5 — Categories (~1 evening)** ✅ built
Categories CRUD, app assignment UI, category colors flow into all charts.

Apps auto-register into the `apps` table the first time their exe shows up in an uploaded slice (first-seen-wins on the display name; a later PATCH edit is never clobbered by a subsequent upload of the same exe). Category is resolved at *read time* via a LEFT JOIN — not baked into `daily_rollups` — so re-categorizing an app immediately updates every past day's chart too, not just going forward.

History's stacked bars now apply the dataviz skill's "part-to-whole → stacked bar, categorical color" guidance directly: Phase 4 deliberately used a single flat color instead of stacking by raw exe name (open-ended cardinality, no natural fixed order — the skill's series-count ladder says fold that into small multiples or composite encoding, not force a stack). Categories are the opposite: small, fixed, meaningful, user-defined — exactly the cardinality a stack wants. Category color choices come from the skill's own validated dark-mode reference palette (checked with `validate_palette.js` against this dashboard's actual surface color, not hand-picked) rather than arbitrary hex values — a first attempt at picking Tailwind colors by eye failed the CVD-separation check outright (ΔE 4.4 between two swatches, far under the floor of 8).

Stacking order is fixed by category id (not sorted by that day's seconds, which the API returns for other uses) — otherwise a category's band would jump position day to day and be untrackable as a trend. Segment gaps are 2px rects painted in the exact page background color, clipped to a rounded-top pill via an SVG `clipPath`, rather than subtracting gap width from each segment's height — simpler and no accumulating rounding error across a stack.

**Phase 6 — Daily limit + push (~1–2 evenings)** ✅ built
VAPID push from the API, subscribe flow in Settings, ingest-time limit check.
*Done when:* Set limit to 1 minute, use the PC, phone buzzes within ~2 minutes.

The limit check runs inline at the end of every slice upload (`checkDailyLimitAndNotify`, called from `POST /v1/slices`) rather than on a cron — a cron would only catch the crossing up to a poll interval late, and the agent already uploads frequently, so piggybacking on ingest gives near-immediate notification with no extra moving part. A `settings.limitAlertSentDate` row (compared against today's local date, derived from the same `TIMEZONE` env var as the rollup boundaries) gates it to exactly one push per calendar day regardless of how many uploads cross the threshold afterward.

`sendPushToAllSubscriptions` swallows every send failure into a `console.error` and specifically sweeps 404/410 responses into a stale-endpoint cleanup — a dead subscription (uninstalled PWA, revoked permission, iOS reinstall) self-heals out of the table instead of erroring on every future notification forever.

Verification here needed real infrastructure, not mocks, and surfaced two environment issues that were mistaken for app bugs at first:
- Playwright's default `browser.newContext()` is an incognito-mode context, and Chrome deliberately disables the Push API there — `pushManager.subscribe()` never even got called. Fixed by switching the test harness to `chromium.launchPersistentContext()` with a real temp profile directory.
- With that fixed, subscribing still failed with Chromium's literal error string *"push service not available."* This wasn't a code bug — Playwright's bundled Chromium is an open-source build with no Google API keys compiled in, and registering with the real push service requires them. Real Google Chrome has the keys; pointing the test at `channel: "chrome"` (already installed on this machine) fixed it, and subscribing then took ~3 seconds for the real round trip to Google's registration servers.
- With a genuine subscription in hand, the send path was verified for real (not just "didn't throw," since `sendPushToAllSubscriptions` catches everything internally and would silently look successful either way): a temporary log of `webpush.sendNotification`'s resolved `statusCode` confirmed a real `201` from `fcm.googleapis.com` on first crossing, and a second crossing the same day produced no second send — confirming the once-a-day guard — before the temporary logging was removed.

**Phase 7 — Polish (~1 evening)** ✅ built
Tray icon menu, autostart registry entry, single-file publish, log rotation, README.

The sampling loop (`Program.cs`) previously *was* the entire program, blocking on `await timer.WaitForNextTickAsync()` at top level. A `NotifyIcon`'s context menu needs a real Windows message pump (`Application.Run()`), which is itself blocking — so the loop was extracted into a local `RunTrackingLoopAsync(CancellationToken)`, kicked off via `Task.Run` *before* `Application.Run()` takes the main thread. The two never contend: `PeriodicTimer`/`HttpClient`/SQLite don't need a message pump, and a thread-pool thread's `SynchronizationContext.Current` stays null regardless of what the main STA thread installs. Tray "Exit" and terminal Ctrl+C now converge on the same path (cancel the token, let `Application.Run()` return, await the loop's own `OperationCanceledException`-triggered flush) rather than the old bare `running = false` flag.

The tray/app icon is one hand-rolled clock glyph (`scripts/gen_icons.py`, extended to also emit a multi-resolution `.ico` alongside the existing PWA PNGs) baked in once via `<ApplicationIcon>` and read back at runtime with `Icon.ExtractAssociatedIcon(Environment.ProcessPath)` — one source image, zero embedded-resource wiring, and it degrades to `SystemIcons.Application` for `dotnet run` dev hosts that don't carry it.

Autostart is the per-user `HKCU\...\Run` key (no admin rights) rather than a scheduled task or machine-wide key; "enabled" is judged by whether the registered path matches *this* running exe, so a moved install correctly reads as disabled instead of trusting a stale path. Log rotation is one file per calendar day under `%LOCALAPPDATA%\ScreenTime\logs\`, pruned to 14 days on startup — simpler than size-based rotation and keeps "what happened on Tuesday" a single file away.

Verification here deliberately avoided UI automation on the live desktop after an early attempt at it (a simulated click intended for the taskbar's hidden-icons chevron landed near unrelated on-screen activity — a GitHub password-reset dialog and a VS Code sign-in toast that turned out to be a concurrent `.NET` SDK download, not caused by the click, but not worth re-risking) — every piece added this phase was instead verified without touching the live screen: the published `Release` exe was launched directly and stayed up (proving the STA/`NotifyIcon`/message-pump wiring doesn't throw on startup), `Icon.ExtractAssociatedIcon` was called against that exact exe from a throwaway script to confirm the custom icon round-trips through `<ApplicationIcon>` correctly, the Run-key mechanism was round-tripped directly against the same key/value path `AutostartManager` uses, and log pruning was confirmed by seeding a 20-day-old log file and observing it disappear on the next startup. The agent's own log output from these runs (real `ACTIVE`/`CLOSED` lines tracking real foreground-app switches) doubled as confirmation that moving the loop into `RunTrackingLoopAsync` didn't change its behavior.

Total: roughly **8–11 evenings** for the full feature set; Phases 0–3 (a usable end-to-end product) in about 4.

---

## 7. Risks & accepted trade-offs

| Risk | Mitigation / stance |
|---|---|
| Some games' raw input doesn't update `GetLastInputInfo` → falsely AFK while playing | Cursor-delta fallback (§3.1). Verify against *your* games in Phase 1 — this is exactly why the agent is built and validated first. |
| Strict input-only rule under-counts video watching | Accepted by decision. If it stings later, add a config-flag per-app media override (Windows audio-session API) — no schema change needed. |
| 2-min threshold trips while reading long content | Accepted; `idleThresholdSec` is a config value, change any time. |
| iOS push fragility (PWA reinstall kills subscription) | Settings shows subscription health; one-tap resubscribe. |
| Vercel/Postgres free-tier limits | Usage is a tiny fraction of either free tier. Non-issue. The one real trade-off is Postgres cold-start after idling (see §4) — a UX blip, not a data problem. |
| Token leak (URL is public on vercel.app) | Tokens are 256-bit random; all data routes require Bearer auth; rotation is a one-line env var update. |

**Prior art worth skimming:** [ActivityWatch](https://activitywatch.net/) (open source) uses the same watcher→bucket→dashboard architecture and the same input-recency AFK model — useful as a sanity check for detection behavior, though it has no hosted/phone story, which is the whole point of building this.

---

## 8. Cost summary

| Item | Cost |
|---|---|
| Vercel Hobby (functions + cron + static hosting) | $0 (free tier) |
| Postgres (Neon/Supabase-class provider, free tier) | $0 (free tier) |
| HTTPS + `*.vercel.app` subdomain | $0 |
| Apple anything | $0 (PWA) |
| .NET / tooling | $0 |
| Optional custom domain | ~$10/yr, optional |
| **Total** | **$0/month** |
