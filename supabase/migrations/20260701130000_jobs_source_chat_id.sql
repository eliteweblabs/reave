-- Link jobs back to the dashboard chat thread that created them.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_chat_id TEXT;

CREATE INDEX IF NOT EXISTS jobs_source_chat_id_idx ON jobs (source_chat_id)
  WHERE source_chat_id IS NOT NULL;
