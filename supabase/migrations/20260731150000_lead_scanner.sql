-- Lead scanner config, run history, and dedupe for property lead cron.

CREATE TABLE IF NOT EXISTS lead_scanner_config (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled          BOOLEAN NOT NULL DEFAULT false,
  center_lat       DOUBLE PRECISION,
  center_lng       DOUBLE PRECISION,
  radius_miles     DOUBLE PRECISION NOT NULL DEFAULT 15,
  trades           JSONB NOT NULL DEFAULT '[]'::jsonb,
  use_company_office BOOLEAN NOT NULL DEFAULT true,
  scan_hour_local  INT NOT NULL DEFAULT 6,
  timezone         TEXT NOT NULL DEFAULT 'America/New_York',
  last_run_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lead_scanner_runs (
  id               UUID PRIMARY KEY,
  ran_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  source           TEXT NOT NULL DEFAULT 'cron',
  candidates_found INT NOT NULL DEFAULT 0,
  new_leads        INT NOT NULL DEFAULT 0,
  skipped          INT NOT NULL DEFAULT 0,
  errors           JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS lead_scanner_seen (
  property_id      TEXT NOT NULL,
  address_key      TEXT NOT NULL,
  contact_uid      TEXT,
  job_slug         TEXT,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id)
);

CREATE INDEX IF NOT EXISTS idx_lead_scanner_seen_address ON lead_scanner_seen (address_key);
