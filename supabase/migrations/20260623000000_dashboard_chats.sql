-- Dashboard chat threads: web UI agent conversations (Clerk user_id scoped).
-- Run via Supabase dashboard SQL editor, CLI, or the MCP execute_sql tool.

create table if not exists chat_threads (
  id          uuid        primary key default gen_random_uuid(),
  user_id     text        not null,
  title       text        not null default 'New chat',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists chat_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references chat_threads(id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists chat_threads_user_idx on chat_threads (user_id, updated_at desc);
create index if not exists chat_messages_thread_idx on chat_messages (thread_id, created_at asc);

create trigger chat_threads_updated_at
  before update on chat_threads
  for each row execute function touch_updated_at();

alter table chat_threads enable row level security;
alter table chat_messages enable row level security;

create policy "service_role_chat_threads"
  on chat_threads for all
  to service_role
  using (true)
  with check (true);

create policy "service_role_chat_messages"
  on chat_messages for all
  to service_role
  using (true)
  with check (true);
