-- Opt-in: forwarded mail may also auto-create a project. Default off.
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS create_project BOOLEAN NOT NULL DEFAULT false;
