-- Deploy failure incidents: one active repair per GitHub repo at a time.
-- Prevents duplicate email/webhook alerts from spawning parallel agent runs.

create table if not exists deploy_incidents (
  id              uuid primary key default gen_random_uuid(),
  dedup_key       text not null,
  repo            text not null,
  project         text,
  service         text,
  environment     text,
  deployment_id   text,
  commit_sha      text,
  source          text not null check (source in ('webhook', 'email')),
  status          text not null default 'open'
    check (status in ('open', 'investigating', 'fixing', 'verifying', 'resolved', 'escalated', 'suppressed')),
  email_id        text,
  alert_message   text,
  agent_reply     text,
  fix_commit_sha  text,
  resolution      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz
);

-- Block parallel active incidents for the same repo (dedup_key = github repo slug).
create unique index if not exists idx_deploy_incidents_active_repo
  on deploy_incidents (dedup_key)
  where status in ('open', 'investigating', 'fixing', 'verifying');

create index if not exists idx_deploy_incidents_repo_created
  on deploy_incidents (repo, created_at desc);

create index if not exists idx_deploy_incidents_status
  on deploy_incidents (status, created_at desc);
