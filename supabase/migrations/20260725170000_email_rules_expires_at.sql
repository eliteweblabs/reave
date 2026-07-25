-- Optional per-rule expiration for email triage rules.
-- NULL = indefinite (default). Expired rules are skipped at classification time.

alter table email_rules
  add column if not exists expires_at timestamptz;
