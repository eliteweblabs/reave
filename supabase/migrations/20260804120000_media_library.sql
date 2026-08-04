-- Admin media library — shared images/files for branding and content.
CREATE TABLE IF NOT EXISTS media_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  media_type    TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  data_base64   TEXT NOT NULL,
  alt_text      TEXT,
  uploaded_by   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_library_created_idx ON media_library (created_at DESC);
