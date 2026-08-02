-- Store full scan results for review before project import.

ALTER TABLE lead_scanner_runs
  ADD COLUMN IF NOT EXISTS candidates JSONB NOT NULL DEFAULT '[]'::jsonb;
