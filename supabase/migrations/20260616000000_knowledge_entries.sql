-- Knowledge entries: live store for bot-accessible internal docs and context.
-- Run via Supabase dashboard SQL editor, CLI, or the MCP execute_sql tool.

create table if not exists knowledge_entries (
  id          uuid        primary key default gen_random_uuid(),
  slug        text        not null unique,
  title       text        not null default '',
  content     text        not null default '',
  tags        text[]      not null default '{}',
  source      text        not null default 'manual', -- 'bundled' | 'manual' | 'bot'
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  -- Generated full-text search vector: title/tags weighted A, content weighted B
  search_vector tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(array_to_string(tags, ' '), '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B')
  ) stored
);

create index if not exists knowledge_slug_idx   on knowledge_entries (slug);
create index if not exists knowledge_search_idx on knowledge_entries using gin(search_vector);
create index if not exists knowledge_updated_idx on knowledge_entries (updated_at desc);

-- Function to auto-touch updated_at on any UPDATE
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger knowledge_entries_updated_at
  before update on knowledge_entries
  for each row execute function touch_updated_at();

-- RLS: table is server-only (service_role key). Keep RLS on as a safety net.
alter table knowledge_entries enable row level security;

create policy "service_role_full_access"
  on knowledge_entries for all
  to service_role
  using (true)
  with check (true);
