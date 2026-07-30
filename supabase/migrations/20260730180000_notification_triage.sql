-- Email knowledge triage: owner feedback on agent email decisions creates filter rules.

ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_triage_at TIMESTAMPTZ;
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_triage_action TEXT;
ALTER TABLE email_inbox ADD COLUMN IF NOT EXISTS automation_triage_rule_id TEXT;
