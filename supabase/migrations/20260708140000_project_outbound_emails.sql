-- Outbound project emails — used to detect urgent client replies.

CREATE TABLE IF NOT EXISTS project_outbound_emails (
  id            UUID PRIMARY KEY,
  job_slug      TEXT NOT NULL,
  job_title     TEXT NOT NULL DEFAULT '',
  contact_uid   TEXT,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL DEFAULT '',
  resend_id     TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by       TEXT,
  source        TEXT NOT NULL DEFAULT 'unknown'
);

CREATE INDEX IF NOT EXISTS project_outbound_emails_to_idx
  ON project_outbound_emails (to_email, sent_at DESC);

CREATE INDEX IF NOT EXISTS project_outbound_emails_contact_idx
  ON project_outbound_emails (contact_uid, sent_at DESC) WHERE contact_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_outbound_emails_job_idx
  ON project_outbound_emails (job_slug, sent_at DESC);
