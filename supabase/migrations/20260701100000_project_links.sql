-- Bidirectional links between work/projects and inbox emails or dashboard chats.

CREATE TABLE IF NOT EXISTS project_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_slug    TEXT NOT NULL,
  link_type   TEXT NOT NULL CHECK (link_type IN ('email', 'chat')),
  link_id     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_slug, link_type, link_id)
);

CREATE INDEX IF NOT EXISTS project_links_job_idx ON project_links (job_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS project_links_item_idx ON project_links (link_type, link_id);

CREATE INDEX IF NOT EXISTS email_inbox_job_slug_idx ON email_inbox (job_slug)
  WHERE job_slug IS NOT NULL;

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS source_email_id TEXT;
