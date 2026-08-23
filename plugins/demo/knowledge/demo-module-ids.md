# Demo module IDs

Numeric ids for demo suite URLs. Source of truth: the Catalog admin page / [`src/lib/moduleCatalog.ts`](../../../src/lib/moduleCatalog.ts).

Ids are **banded with gaps** so new modules can be inserted without remumbering the rest (same idea as leaving room between Railway variables):

| Band | Range | Step |
|------|-------|------|
| Core OS | 001–100 | 5 |
| Work | 101–200 | 10 |
| Social | 201–300 | 10 |
| E-commerce | 301–400 | 10 |
| Web Development | 401–500 | 10 |
| Other | 501–600 | 10 |
| Internal | 601–700 | 10 |

Railway `FEATURES` and `config/config-*.json` still use **feature slugs** (`billing`, `social_inbox`) — not these numbers. Playbooks that still store old sequential `001`–`037` ids are remapped on load.

Use in sales links:

```
https://demo.reave.app/?demo=tier-1&modules=[010,110,420,530]&industry=plumbing
```

(Exact numbers follow the Catalog table — Core cards start at `005`, then `010`, …)

Full catalog API: `GET /api/demo/suite` (returns `catalog` array).

## Baseline

Core FeatureIds `client_portal`, `web_handoff`, and `portal_assistant` share the Core OS card ids for those tiles. They are always enabled on tier-1 demos and are not shown in the public `/demo-loader` picker. Billing is an optional Work add-on.

## URL params

| Param | Example | Purpose |
|-------|---------|---------|
| `demo` | `tier-1` | Install tier (only tier 1 today) |
| `modules` | `[010,110,420]` | Which modules to enable + seed |
| `industry` | `plumbing` | Seed fixtures (`general`, `plumbing`, …) |

After landing, params are stored in the `reave_demo_suite` cookie for seven days.
