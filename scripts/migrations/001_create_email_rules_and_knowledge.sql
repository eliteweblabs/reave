-- Migration: Create email_rules and client_knowledge tables
-- Purpose: Move client-specific email rules and knowledge from repo to database
-- Date: 2026-09-05

-- Email rules table (universal + client-specific)
CREATE TABLE IF NOT EXISTS email_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID,  -- NULL = universal rule
  name TEXT NOT NULL,
  description TEXT,
  pattern TEXT NOT NULL,  -- keyword/regex to match
  match_fields TEXT[] DEFAULT ARRAY['subject', 'body'],  -- fields to search
  action TEXT NOT NULL,  -- DELETE, ARCHIVE, RECEIPT, KEEP, etc.
  notify BOOLEAN DEFAULT true,
  notify_type TEXT,  -- PUSH, DASHBOARD, or comma-separated
  forward_to TEXT,  -- optional email to forward to
  create_project BOOLEAN DEFAULT false,
  except_phrases TEXT[] DEFAULT ARRAY[]::TEXT[],  -- NOT matchers
  priority INT DEFAULT 0,  -- sort order (lower = earlier)
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, name)
);

-- Client-specific knowledge/documentation (NULL client_id = install-universal seed rows)
CREATE TABLE IF NOT EXISTS client_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  slug TEXT NOT NULL,  -- URL-safe identifier
  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- markdown
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],  -- searchable tags
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id, slug)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_email_rules_client_id ON email_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_email_rules_enabled ON email_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_email_rules_priority ON email_rules(priority);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_client_id ON client_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_slug ON client_knowledge(slug);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_tags ON client_knowledge USING GIN(tags);

-- Seed universal email rules (client_id = NULL means universal)
INSERT INTO email_rules (client_id, name, description, pattern, match_fields, action, notify, notify_type, priority, enabled)
VALUES
  (NULL, 'VERIFICATION_CODE', 'One-time verification and login codes', 'verification code|otp|login code|verification|[0-9]{4,}', ARRAY['subject', 'body'], 'KEEP', true, 'PUSH+DASHBOARD', 1, true),
  (NULL, 'AUTH_LINK', 'Magic sign-in and activation links', 'magic sign-in link|activation link|secure link to|one-click|authenticate now', ARRAY['subject', 'body'], 'KEEP', true, 'PUSH+DASHBOARD', 2, true),
  (NULL, 'ALERT_CLAUDE_API', 'Claude API access alerts', 'Claude API access is turned off|claude.*disabled', ARRAY['subject', 'body'], 'KEEP', true, 'PUSH+DASHBOARD', 10, true),
  (NULL, 'ALERT_BUILD_FAILED', 'Build failure notifications', 'Build failed for|deployment failed|build error', ARRAY['subject', 'body'], 'KEEP', true, 'PUSH+DASHBOARD', 11, true),
  (NULL, 'ALERT_UPTIME', 'UptimeRobot monitoring alerts', 'UptimeRobot|downtime|is down', ARRAY['subject', 'body'], 'KEEP', true, 'PUSH+DASHBOARD', 12, true),
  (NULL, 'ALERT_SIGN_IN', 'Security: new sign-in detected', 'detected a new sign-in|a new sign-in|new sign-in to', ARRAY['subject', 'body'], 'KEEP', true, 'PUSH+DASHBOARD', 13, true),
  (NULL, 'SHIPMENT_TRACKED', 'Shipment tracking updates', 'shipment tracked|tracking your|order has shipped', ARRAY['subject', 'body'], 'ARCHIVE', false, '', 20, true),
  (NULL, 'PAYMENT_RECEIPT', 'Payment receipts for tax tracking', 'your receipt|payment confirmation|you paid|receipt from', ARRAY['subject', 'body'], 'KEEP', false, '', 21, true),
  (NULL, 'GOOGLE_INVOICE', 'Google Workspace invoices', 'Google Workspace|monthly invoice', ARRAY['subject'], 'ARCHIVE', false, '', 22, true),
  (NULL, 'DELETE_SIGNIN', 'New sign-in security notices (delete after alert)', 'detected a new sign-in|a new sign-in|new sign-in to|sign-in location|sign in from', ARRAY['subject', 'body'], 'DELETE', false, '', 30, true),
  (NULL, 'DELETE_UNSUBSCRIBE', 'Unsubscribe marketing mail', 'unsubscribe|opt out|marketing|newsletter|promotional', ARRAY['body'], 'DELETE', false, '', 31, true)
ON CONFLICT (client_id, name) DO NOTHING;
