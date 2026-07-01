-- Tracked redirect links for project/client portal shares (click analytics).

CREATE TABLE IF NOT EXISTS project_tracked_links (
  token             TEXT PRIMARY KEY,
  job_slug          TEXT NOT NULL,
  contact_uid       TEXT NOT NULL,
  destination       TEXT NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by           TEXT,
  channel           TEXT NOT NULL DEFAULT 'share',
  click_count       INT NOT NULL DEFAULT 0,
  first_clicked_at  TIMESTAMPTZ,
  last_clicked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS project_tracked_links_job_idx
  ON project_tracked_links (job_slug, sent_at DESC);
