-- Scheduled auto-delete for short-lived inbox rows (e.g. verification codes).
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS delete_after_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS email_inbox_delete_after_idx
  ON email_inbox (delete_after_at)
  WHERE delete_after_at IS NOT NULL;
