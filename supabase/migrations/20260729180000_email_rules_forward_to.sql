-- Auto-forward matched inbound mail to an external address (Resend outbound).
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS forward_to TEXT;
