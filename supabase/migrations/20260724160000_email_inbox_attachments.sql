-- Store Resend inbound attachment metadata on inbox rows (content fetched on demand).
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS attachments_json JSONB NOT NULL DEFAULT '[]'::jsonb;
