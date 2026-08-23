# Demo module IDs

Numeric ids for demo suite URLs. Source of truth: the Catalog admin page / [`src/lib/moduleCatalog.ts`](../../../src/lib/moduleCatalog.ts).

Ids are **consecutive inside each group** (no gaps). Order inside a band is shuffled so the number is not a rank:

| Band | Range |
|------|-------|
| Core OS | 001–100 |
| Work | 101–200 |
| Social | 201–300 |
| E-commerce | 301–400 |
| Web Development | 401–500 |
| Other | 501–600 |
| Internal | 601–700 |
| Google™ Workspace | 701–800 |

Feature slugs use **underscores** (`agent_chat`, `social_inbox`). Railway `FEATURES` and `config/config-*.json` still use those slugs — not the numbers. Playbooks that still store old sequential `001`–`037` ids are remapped on load.

Use in sales links:

```
https://demo.reave.app/?demo=tier-1&modules=[001,101,401]&industry=plumbing
```

Exact numbers are on Catalog / `GET /api/demo/suite`.

## Baseline

Core FeatureIds `client_portal`, `web_handoff`, and `portal_assistant` share the Core OS card ids for those tiles. They are always enabled on tier-1 demos and are not shown in the public `/demo-loader` picker. Billing is an optional Work add-on.

## URL params

| Param | Example | Purpose |
|-------|---------|---------|
| `demo` | `tier-1` | Install tier (only tier 1 today) |
| `modules` | `[001,101,401]` | Which modules to enable + seed |
| `industry` | `plumbing` | Seed fixtures (`general`, `plumbing`, …) |

After landing, params are stored in the `reave_demo_suite` cookie for seven days.
