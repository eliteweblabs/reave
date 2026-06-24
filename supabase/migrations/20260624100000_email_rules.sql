-- Email triage rules (plain Postgres — e.g. Railway reave-postgres).
-- Also applied automatically on first connection via src/lib/emailRuleStore.ts.

create table if not exists email_triage_config (
  id                  int primary key default 1 check (id = 1),
  notify_on_unmatched boolean not null default true,
  updated_at          timestamptz not null default now()
);

insert into email_triage_config (id, notify_on_unmatched) values (1, true)
  on conflict (id) do nothing;

create table if not exists email_rules (
  id          uuid primary key,
  sort_order  int not null default 0,
  title       text not null,
  status      text not null,
  description text,
  phrases     jsonb not null default '[]',
  match_mode  text not null default 'any',
  fields      jsonb not null default '["subject","body"]',
  notify      boolean not null default false,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists email_rules_sort_idx on email_rules (sort_order asc, created_at asc);
