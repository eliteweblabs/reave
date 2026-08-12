-- Email rule scope: universal (all Reave installs / repo catalog) vs personal (this install).
ALTER TABLE email_rules ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'personal';
ALTER TABLE email_triage_config ADD COLUMN IF NOT EXISTS rule_scope_seeded BOOLEAN NOT NULL DEFAULT false;

-- Backfill catalog statuses as universal (matches DEFAULT_RULES in emailRules.ts).
UPDATE email_rules
SET scope = 'universal'
WHERE upper(status) IN (
  'VERIFICATION_CODE',
  'AUTH_LINK',
  'ANTHROPIC_BILLING',
  'RAILWAY_ALERT',
  'DOWN',
  'NEEDS_CHECK',
  'RECEIPT',
  'AUTO_ARCHIVED',
  'DELETE'
);

UPDATE email_triage_config SET rule_scope_seeded = true, updated_at = now() WHERE id = 1;
