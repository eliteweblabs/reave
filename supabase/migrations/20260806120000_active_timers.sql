-- Active time-tracking timers (Siri / dashboard start-stop)
CREATE TABLE IF NOT EXISTS active_timers (
  owner_key VARCHAR(64) PRIMARY KEY,
  job_slug VARCHAR(255) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_active_timers_job ON active_timers(job_slug);
