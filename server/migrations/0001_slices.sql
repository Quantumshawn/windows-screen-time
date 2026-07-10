CREATE TABLE slices (
  id        TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  exe       TEXT NOT NULL,
  start_ts  INTEGER NOT NULL,
  end_ts    INTEGER NOT NULL,
  CHECK (end_ts >= start_ts)
);

CREATE INDEX idx_slices_time ON slices(start_ts);
