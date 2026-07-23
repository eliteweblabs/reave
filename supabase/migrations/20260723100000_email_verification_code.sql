-- Store parsed OTP from inbound email for copy-to-clipboard in the admin Email tab.
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS verification_code TEXT;
