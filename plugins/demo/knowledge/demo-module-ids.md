# Demo module IDs

Stable numeric ids for demo suite URLs. Source of truth: [`src/lib/demoModuleCatalog.ts`](../../../src/lib/demoModuleCatalog.ts).

Use in sales links:

```
https://demo.reave.app/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
```

Full catalog API: `GET /api/demo/suite` (returns `catalog` array).

## Module picker

| ID | Feature | Label |
|----|---------|-------|
| 001 | `client_portal` | Client portal (/c/:uid) |
| 002 | `web_handoff` | Portal Data tab (handoff creds) |
| 003 | `portal_assistant` | Client portal help chat (speed-dial support assistant) |
| 004 | `billing` | Crater billing & invoices |
| 005 | `site_audits` | Site audits (Lighthouse, SSL, DNS, links) |
| 006 | `site_monitoring` | Site change monitoring (ChangeDetection.io) |
| 007 | `uptime_monitoring` | Uptime monitoring (UptimeRobot) |
| 008 | `documents` | Document signing templates |
| 009 | `voice` | Telnyx voice agent |
| 010 | `vapi` | Vapi assistant (admin sync & branding) |
| 011 | `carddav` | CardDAV (iOS Contacts sync) |
| 012 | `scheduling` | Cal.com scheduling & meetings |
| 013 | `dev_infra` | Dev & infrastructure (Git, Railway, Kinsta, deploy) |
| 014 | `code_dev` | Local code tools (read/write/list/exec) — Reave install only |
| 015 | `email_marketing` | Newsletter & email automation |
| 016 | `fleet_tracking` | Fleet tracking (multi-vehicle GPS via fleet-api) |
| 017 | `dealership_wizard` | Dealership inventory & deal wizard (paulino-wizard) |
| 018 | `namecom_dns` | DNS record management (Name.com) — agency/ops installs only |
| 019 | `time_tracking` | Project time log (hours + notes → invoicing) |
| 020 | `demo` | Demo mode (seed script, quick-start wizard) |
| 021 | `real_estate_data` | Real estate data & lead scanner |
| 022 | `inventory_sync` | Multi-channel inventory sync |
| 023 | `online_reviews` | Online reviews inbox — Google sync + response workflow |

## Default suite (no URL)

When someone opens the demo admin without URL params, modules **001, 004, 006, 009** are enabled (`client_portal`, `billing`, `site_monitoring`, `voice`) with industry `general`.

## URL params

| Param | Example | Purpose |
|-------|---------|---------|
| `demo` | `tier-1` | Install tier (only tier 1 today) |
| `modules` | `[001,004,006,009]` | Which modules to enable + seed |
| `industry` | `plumbing` | Seed fixtures (`general`, `plumbing`, …) |

After landing, params are stored in the `reave_demo_suite` cookie for seven days.
