-- Durable recall across admin chats. Live installs also create this via
-- src/lib/pgAgentMemories.ts on first use.

create table if not exists agent_memories (
  id serial primary key,
  user_id text not null,
  scope text not null default 'user'
    check (scope in ('user', 'install')),
  kind text not null default 'fact'
    check (kind in ('preference', 'procedure', 'fact', 'decision', 'client', 'habit')),
  key text not null,
  content text not null,
  source text not null default 'agent'
    check (source in ('agent', 'extract', 'owner')),
  source_thread_id text,
  hit_count int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create unique index if not exists agent_memories_user_key
  on agent_memories (user_id, key) where scope = 'user';
create unique index if not exists agent_memories_install_key
  on agent_memories (key) where scope = 'install';
create index if not exists agent_memories_user_updated
  on agent_memories (user_id, updated_at desc);
create index if not exists agent_memories_search
  on agent_memories using gin (to_tsvector('english', key || ' ' || content));
