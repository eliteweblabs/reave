CREATE TABLE IF NOT EXISTS deck_industries (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR(64) NOT NULL UNIQUE,
  label       VARCHAR(120) NOT NULL,
  sort_order  INT NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  playbook    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE deck_industries ADD COLUMN IF NOT EXISTS playbook JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_deck_industries_sort ON deck_industries (sort_order, id);
