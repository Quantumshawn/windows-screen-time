# ScreenTime — PC Activity Tracker with iOS Dashboard

**One-line summary:** A Windows background agent (C#) measures *active* time at the PC using real keyboard/mouse input (so AFK-in-Minecraft doesn't count), uploads per-app time slices to a free Cloudflare backend, and an installable PWA dashboard on your iPhone shows today/history/categories and pushes an alert when you cross your daily limit.

---

## 1. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| iOS delivery | PWA (Add to Home Screen) | No Mac, no Apple account, $0. Push works on iOS 16.4+ when installed to home screen. |
| Tracking granularity | Per-app (exe name), no window titles | "3h Minecraft, 2h Chrome" — no record of *what* you did inside each app. |
| Hosting | Cloudflare Workers + D1 (free tier) | $0/month, data reachable when PC is off, one platform for API + dashboard + cron + push. |
| AFK threshold | **2 minutes** of no input | Aggressive AFK detection. Reading a long page without touching the mouse *will* trip it — threshold is a config value, easy to change later. |
| Media rule | **Input only (strict)** | Watching YouTube/Netflix without touching input counts as AFK after 2 min. Never over-counts; accepts under-counting video time. A per-app media override can be added later behind a config flag without schema changes. |
| Agent stack | C# / .NET 8 | Single self-contained `.exe`, first-class Win32 access, tray icon, tiny footprint. |
| Backend/dashboard stack | TypeScript: Hono on Workers, React + Vite PWA | JS-first platform; one deploy serves both API and static dashboard. |
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
│  │ · GetForegroundWindow │  │   │ Cloudflare Worker (Hono/TS)  │
│  │ · SQLite offline queue│  │   │ · POST /api/v1/slices        │
│  └───────────────────────┘  │   │ · GET  summary / range       │
└─────────────────────────────┘   │ · settings / categories      │
                                  │ · Web Push (VAPID)           │
                                  │ · Cron: daily rollups        │
                                  │ · serves PWA static assets   │
                                  └──────────┬───────────────────┘
                                             │ D1 (SQLite)
                                             ▼
                                  ┌──────────────────────────────┐
                                  │ iPhone — installed PWA       │
                                  │ Today · History · Settings   │
                                  │ Push: "Daily limit reached"  │
                                  └──────────────────────────────┘
```

Three deliverables, one repo:

```
screentime/
├── agent/          # C# .NET 8 — Windows tracker (tray app)
├── server/         # Cloudflare Worker — Hono API + cron + push + serves dashboard build
├── dashboard/      # React + Vite + Tailwind PWA (build output bound as Worker assets)
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

## 4. Component spec — Backend (`server/`)

**Stack:** Cloudflare Workers + Hono (TypeScript) + D1 (SQLite) + Cron Triggers + Workers static assets (serves the dashboard build). Free tier: 100k requests/day, 5M D1 reads/day — your load is ~1,440 uploads/day + dashboard reads; three orders of magnitude of headroom.

### 4.1 Auth (single user, keep it boring)

Two long random tokens generated at setup, stored as Worker secrets:
- `DEVICE_TOKEN` — the agent's Bearer token; can only write slices.
- `DASHBOARD_TOKEN` — entered once in the PWA, kept in `localStorage`; read + settings.

No user accounts, no OAuth, no sessions. If a token leaks, rotate the secret and update the two clients.

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

### 4.3 Data model (D1)

```sql
CREATE TABLE slices (
  id          TEXT PRIMARY KEY,          -- client ULID → idempotent upserts
  device_id   TEXT NOT NULL,             -- future multi-PC; hardcode 'desktop' for now
  exe         TEXT NOT NULL,             -- e.g. 'javaw' / 'chrome'
  start_ts    INTEGER NOT NULL,          -- UTC epoch seconds
  end_ts      INTEGER NOT NULL,
  CHECK (end_ts >= start_ts)
);
CREATE INDEX idx_slices_time ON slices(start_ts);

CREATE TABLE apps (
  exe          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,            -- from FileDescription, user-editable
  category_id  INTEGER REFERENCES categories(id)  -- NULL = Uncategorized
);

CREATE TABLE categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL,                   -- Gaming / Productivity / Browsing / …
  color TEXT NOT NULL                    -- hex, drives chart colors
);

CREATE TABLE daily_rollups (              -- materialized by nightly cron
  date    TEXT NOT NULL,                 -- local date 'YYYY-MM-DD'
  exe     TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  PRIMARY KEY (date, exe)
);

CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- keys: dailyLimitMinutes, timezone, limitAlertSentDate
```

### 4.4 Cron jobs

- **Nightly (00:30 local):** roll up yesterday's slices into `daily_rollups`, splitting midnight-spanning slices; slices older than 90 days can then be pruned (rollups keep the history forever at ~10 rows/day).

### 4.5 Daily-limit push flow

1. Every `POST /slices` recomputes today's total (yesterday's rollup boundary + today's live slices).
2. If `total ≥ dailyLimitMinutes` **and** `limitAlertSentDate != today` → send Web Push to all subscriptions, set `limitAlertSentDate = today` (fires exactly once per day).
3. Latency worst case ≈ agent upload interval = ~60s after crossing the limit. Good enough.

Web Push on Workers: the popular `web-push` npm lib is Node-only; use a WebCrypto-based implementation (e.g. `webpush-webcrypto` or hand-rolled VAPID JWT + `aes128gcm` — both known-working on Workers). Generate one VAPID keypair at setup; store as Worker secrets.

---

## 5. Component spec — PWA Dashboard (`dashboard/`)

**Stack:** React 18 + Vite + Tailwind. Charts: Recharts (or hand-rolled SVG bars — data is simple). Build output served by the Worker → one deploy, one URL, HTTPS for free on `*.workers.dev` (custom domain optional later, ~$10/yr).

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
Repo layout above; Cloudflare account + `wrangler` CLI; generate the two auth tokens + VAPID keys; `dotnet new` the agent project.
*Done when:* `wrangler dev` serves hello-world, agent skeleton compiles.

**Phase 1 — Agent core, offline only (~1–2 evenings)** ← the highest-risk phase, do it first
Sampling loop, slice construction, retroactive trim, SQLite queue, console output. No network.
*Done when:* You AFK in Minecraft for 10 minutes and the log shows the slice closed at your last real input; you alt-tab between apps and slices split correctly; lock screen ends the slice.

**Phase 2 — Ingest pipeline (~1 evening)**
D1 schema + `POST /slices` + `GET /summary`; agent uploader with backoff; deploy to `workers.dev`.
*Done when:* `curl` of `/summary` from your phone's browser shows real numbers from today.

**Phase 3 — Dashboard "Today" + PWA install (~1–2 evenings)**
Today view, token entry, manifest + service worker; Add to Home Screen on the iPhone.
*Done when:* Icon on your home screen opens to today's live screen time.

**Phase 4 — History & rollups (~1–2 evenings)**
Nightly cron rollups, midnight splitting, `range` endpoint, week/month charts.
*Done when:* Week view shows correct per-day stacks after a few days of data.

**Phase 5 — Categories (~1 evening)**
Categories CRUD, app assignment UI, category colors flow into all charts.

**Phase 6 — Daily limit + push (~1–2 evenings)**
VAPID push from the Worker, subscribe flow in Settings, ingest-time limit check.
*Done when:* Set limit to 1 minute, use the PC, phone buzzes within ~2 minutes.

**Phase 7 — Polish (~1 evening)**
Tray icon menu, autostart registry entry, single-file publish, log rotation, README.

Total: roughly **8–11 evenings** for the full feature set; Phases 0–3 (a usable end-to-end product) in about 4.

---

## 7. Risks & accepted trade-offs

| Risk | Mitigation / stance |
|---|---|
| Some games' raw input doesn't update `GetLastInputInfo` → falsely AFK while playing | Cursor-delta fallback (§3.1). Verify against *your* games in Phase 1 — this is exactly why the agent is built and validated first. |
| Strict input-only rule under-counts video watching | Accepted by decision. If it stings later, add a config-flag per-app media override (Windows audio-session API) — no schema change needed. |
| 2-min threshold trips while reading long content | Accepted; `idleThresholdSec` is a config value, change any time. |
| iOS push fragility (PWA reinstall kills subscription) | Settings shows subscription health; one-tap resubscribe. |
| Cloudflare free-tier limits | Usage is ~0.1% of the free tier. Non-issue. |
| Token leak (URL is public on workers.dev) | Tokens are 256-bit random; all data routes require Bearer auth; rotation is a one-line secret update. |

**Prior art worth skimming:** [ActivityWatch](https://activitywatch.net/) (open source) uses the same watcher→bucket→dashboard architecture and the same input-recency AFK model — useful as a sanity check for detection behavior, though it has no hosted/phone story, which is the whole point of building this.

---

## 8. Cost summary

| Item | Cost |
|---|---|
| Cloudflare Workers + D1 + cron + static hosting | $0 (free tier) |
| HTTPS + `*.workers.dev` subdomain | $0 |
| Apple anything | $0 (PWA) |
| .NET / tooling | $0 |
| Optional custom domain | ~$10/yr, optional |
| **Total** | **$0/month** |
