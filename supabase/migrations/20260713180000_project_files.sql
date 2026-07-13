-- Per-project file repository for media uploaded via chat and admin.

CREATE TABLE IF NOT EXISTS project_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_slug      TEXT NOT NULL,
  filename      TEXT NOT NULL,
  media_type    TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  data_base64   TEXT NOT NULL,
  uploaded_by   TEXT,
  source        TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('chat', 'admin', 'agent', 'email')),
  source_ref    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_files_job_idx ON project_files (job_slug, created_at DESC);
