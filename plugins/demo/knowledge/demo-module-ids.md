# Demo module IDs

Stable numeric ids for demo suite URLs. Source of truth: [`src/lib/demoModuleCatalog.ts`](../../../src/lib/demoModuleCatalog.ts).

Use in sales links:

```
https://demo.reave.app/?demo=tier-1&modules=[001,004,006,009]&industry=plumbing
```

Full catalog API: `GET /api/demo/suite` (returns `catalog` array).

## Module picker

Baseline modules **001–004** (`client_portal`, `web_handoff`, `portal_assistant`, `billing`) are always enabled on tier-1 demos and are **not shown** in the public `/demo-loader` picker.

| ID | Feature | Label |
|----|---------|-------|
| 001 | `client_portal` | Client portal |
| 002 | `web_handoff` | Portal Data tab |
| 003 | `portal_assistant` | Client portal help chat |
| 004 | `billing` | Crater billing & invoices |
| 005 | `site_audits` | Website Audit |
| 006 | `site_monitoring` | Website change monitoring |
| 007 | `uptime_monitoring` | Uptime monitoring |
| 008 | `documents` | Document signing templates |
| 009 | `voice` | Telnyx voice agent |
| 010 | `vapi` | VAPI Voice Agent |
| 011 | `carddav` | CardDAV Contact Sync |
| 012 | `scheduling` | Cal.com scheduling & meetings |
| 013 | `dev_infra` | Dev & infrastructure |
| 014 | `code_dev` | Local code tools |
| 015 | `email_marketing` | Newsletter & email automation |
| 016 | `fleet_tracking` | Fleet tracking / GPS |
| 017 | `dealership_wizard` | Dealership inventory & deal wizard |
| 018 | `namecom_dns` | DNS record management |
| 019 | `time_tracking` | Project Time Tracking |
| 020 | `demo` | Demo mode |
| 021 | `real_estate_data` | Real estate data & lead scanner |
| 022 | `inventory_sync` | Multi-channel inventory sync |
| 023 | `online_reviews` | Reviews triage |
| 024 | `wayback_machine` | Wayback Machine |
| 025 | `content_management` | Agentic Website Editor |
| 026 | `stock_photos` | Pexels stock photos |
| 027 | `wordpress_content` | WordPress content plugin |
| 033 | `website` | Website |
| 034 | `credit_check` | Credit check |
| 036 | `social_inbox` | Social inbox |
| 037 | `google_workspace` | Google™ Workspace (private service) |

## Default suite (no URL)

When someone opens the demo admin without URL params, modules **001, 004, 006, 009** are enabled (`client_portal`, `billing`, `site_monitoring`, `voice`) with industry `general`.

## URL params

| Param | Example | Purpose |
|-------|---------|---------|
| `demo` | `tier-1` | Install tier (only tier 1 today) |
| `modules` | `[001,004,006,009]` | Which modules to enable + seed |
| `industry` | `plumbing` | Seed fixtures (`general`, `plumbing`, …) |

After landing, params are stored in the `reave_demo_suite` cookie for seven days.
