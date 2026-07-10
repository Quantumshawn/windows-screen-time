CREATE TABLE IF NOT EXISTS slices (
  id        TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  exe       TEXT NOT NULL,
  start_ts  BIGINT NOT NULL,
  end_ts    BIGINT NOT NULL,
  CHECK (end_ts >= start_ts)
);

CREATE INDEX IF NOT EXISTS idx_slices_time ON slices(start_ts);
