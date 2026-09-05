-- Migration: client_knowledge table for per-client docs
-- Date: 2026-09-05
--
-- email_rules is owned by src/lib/emailRuleStore.ts (ensureSchema on boot).
-- Do not create a competing email_rules table here — an earlier draft broke
-- Email Lab / Rules saves on Postgres when name/pattern/action NOT NULL columns
-- blocked dashboard inserts (title/status/phrases).

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
CREATE INDEX IF NOT EXISTS idx_client_knowledge_client_id ON client_knowledge(client_id);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_slug ON client_knowledge(slug);
CREATE INDEX IF NOT EXISTS idx_client_knowledge_tags ON client_knowledge USING GIN(tags);
