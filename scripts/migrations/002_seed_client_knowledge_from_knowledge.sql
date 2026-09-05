-- Seed client_knowledge from the legacy knowledge table (universal client sentinel).
-- Run after 001_create_email_rules_and_knowledge.sql on installs that already have knowledge rows.

INSERT INTO client_knowledge (client_id, slug, title, content, tags)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  slug,
  title,
  content,
  COALESCE(tags, ARRAY[]::text[])
FROM knowledge
ON CONFLICT (client_id, slug) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  tags = EXCLUDED.tags,
  updated_at = NOW();
