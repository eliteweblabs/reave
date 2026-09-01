# Auto Email Response

Paid add-on on top of core inbox triage. When a rule or the agent decides a
thread deserves a reply, the module **drafts** copy — it does **not** send until
an owner approves it in admin.

## What ships (scaffold)

- Feature gate: `auto_email_response` in install config
- Pending draft queue keyed to inbox message ids
- Approve / reject API — approve sends a threaded reply via Resend
- Agent can draft via the same compose pipeline as manual replies

## Hand review (required)

Every outbound auto-reply stays in **pending** until a dashboard user approves
it. There is no auto-send path in v1 — even if `AUTO_EMAIL_REPLY_ENABLED` is set
in env, the scaffold keeps review mandatory until productized.

## Relationship to core inbox

- **Inbox triage** (core) — classify, file, meeting automation, project match
- **Email marketing** — scheduled newsletters & welcome sequences
- **Auto email response** — one-off replies to inbound threads the owner would
  otherwise answer manually

## Deploy

See `plugins/auto-email-response/DEPLOY.md`. Requires Resend + the feature flag.
