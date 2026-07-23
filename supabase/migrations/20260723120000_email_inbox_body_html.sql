-- Store original HTML bodies for inbox rendering.
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS body_html TEXT NOT NULL DEFAULT '';
