-- Track whether RESEND_API_KEY has ever been observed as set so a later
-- first blank→set transition can wipe seeded inbox rows (key rotation must not).
ALTER TABLE email_triage_config ADD COLUMN IF NOT EXISTS email_api_seen BOOLEAN;
