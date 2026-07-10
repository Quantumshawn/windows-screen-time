CREATE TABLE IF NOT EXISTS slices (
  id        TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  exe       TEXT NOT NULL,
  start_ts  BIGINT NOT NULL,
  end_ts    BIGINT NOT NULL,
  CHECK (end_ts >= start_ts)
);

CREATE INDEX IF NOT EXISTS idx_slices_time ON slices(start_ts);

-- Materialized by the nightly rollup (api/routes/rollup.ts). One row per (date, exe).
CREATE TABLE IF NOT EXISTS daily_rollups (
  date    TEXT NOT NULL,
  exe     TEXT NOT NULL,
  seconds BIGINT NOT NULL,
  PRIMARY KEY (date, exe)
);

CREATE TABLE IF NOT EXISTS categories (
  id    SERIAL PRIMARY KEY,
  name  TEXT NOT NULL,
  color TEXT NOT NULL
);

-- Auto-registered the first time an exe is seen in an uploaded slice (display_name
-- and category_id are then user-editable via PATCH /api/v1/apps/:exe without being
-- overwritten by later uploads of the same exe — see routes/slices.ts).
CREATE TABLE IF NOT EXISTS apps (
  exe          TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL
);

-- keys used: dailyLimitMinutes, limitAlertSentDate (internal — last local date an
-- over-limit push was sent, so it fires at most once per day; not user-editable)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
