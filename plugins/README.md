# Reave Plugins

Self-contained feature packages. Each plugin owns its **knowledge**, optional **agent tools**, and (when extracted) its integration client code.

Reave core (`src/knowledge/`) holds **generic product mechanics only**. Plugin playbooks never live there.

## Layout

```
plugins/{id}/
├── DEPLOY.md         # deployment playbook (env vars, checklist, defaultStatus)
├── manifest.ts       # feature gate, configured(), agentTools export
├── knowledge/        # bundled markdown playbooks (?raw glob)
│   └── installs/     # optional install-scoped docs
└── agentTools.ts     # optional Admin → Chats tool module
```

Core-only features (no plugin dir) use `config/modules/{feature}.DEPLOY.md`.

Per-install deployment **status** (`deployed`, `development`, `request`, `rejected`) lives in `config/config-{slug}.json` → `moduleStatus`. See [`docs/deployment-punch-list.md`](../docs/deployment-punch-list.md).

## Registered plugins

| Directory | Feature | Knowledge | Agent tools |
|-----------|---------|-----------|-------------|
| `billing/` | `billing` | `crater-billing.md` | yes |
| `carddav/` | `carddav` | `carddav.md` | — |
| `client-portal/` | `client_portal` | `client-portal.md` | yes |
| `code-dev/` | `code_dev` | install-scoped `code-dev-tools.md` | yes |
| `dev-infra/` | `dev_infra` | github, kinsta, railway playbooks | yes |
| `email-marketing/` | `email_marketing` | `newsletter.md` | — |
| `namecom-dns/` | `namecom_dns` | — | yes |
| `scheduling/` | `scheduling` | — | yes |
| `site-audits/` | `site_audits` | inquiry audit playbooks | yes |
| `analytic-audit/` | `analytic_audit` | Search Console / GA4 / Plausible / IndexNow | yes |
| `site-monitoring/` | `site_monitoring` | — | yes |
| `uptime-monitoring/` | `uptime_monitoring` | `uptime-monitoring.md` | yes |
| `fleet/` | `fleet_tracking` | `fleet-tracking.md` | yes |
| `paulino-wizard/` | `dealership_wizard` | `paulino-wizard.md` | yes |
| `inventory/` | `inventory_sync` | `inventory-sync.md` | yes |
| `demo/` | `demo` | `demo-setup.md` | yes |
| `content-management/` | `content_management` | `content-management.md` | — (playbook only; uses dev_infra / code_dev tools) |
| `wordpress-content/` | `wordpress_content` | `wordpress-content.md` | — (stub; companion WP plugin + agent tools TBD) |
| `seo-directory/` | `seo_directory` | `seo-directory.md` | yes — BrightLocal Citation Builder (agency account) |
| `vapi/` | `vapi` | — (see `plugins/vapi/README.md`) | yes — **upsell; off by default** |
| `deploy-wizard/` | `deploy_wizard` | `deploy-wizard.md` | — **REΛVE install only** (`config-reave.json`) |

Enable a plugin in `config/config-{slug}.json` → `"features": ["billing", ...]`.

Clerk (`plugins/clerk-auth/`) is **core** — every package includes sign-in. It has no `features[]` flag; admin tools load when `CLERK_SECRET_KEY` / `CLERK_PLATFORM_KEY` is set.

## How Reave loads plugins

1. **`src/lib/pluginRegistry.ts`** — imports each `plugins/{id}/manifest.ts`
2. **`src/lib/localKnowledge.ts`** — globs `plugins/*/knowledge/**/*.md` (active plugins only)
3. **`src/lib/agentTools/registry.ts`** — core modules + `activeAgentToolModules()` from manifests

No duplicate registration in core — add the manifest import once in `pluginRegistry.ts`.

## Creating a new plugin

1. Create `plugins/my-feature/manifest.ts`:

```typescript
import type { ReavePlugin } from '../_shared/types';
import { myFeatureModule } from './agentTools'; // optional

export const myFeaturePlugin: ReavePlugin = {
  id: 'my-feature',
  feature: 'my_feature', // add to src/lib/features.ts + install config
  configured: () => !!process.env.MY_API_KEY, // optional
  agentTools: myFeatureModule,
};
```

2. Add knowledge under `plugins/my-feature/knowledge/my-feature.md`
3. Register slug in `pluginKnowledgeSlugs()` inside `pluginRegistry.ts`
4. Import manifest in `REAVE_PLUGINS` array
5. Enable feature in install config

## External plugin repos

For plugins maintained in separate git repos (e.g. Crater service docs living with Crater):

- Mirror this folder layout in the external repo
- Publish as an npm package or git submodule under `plugins/{id}/`
- Register the manifest in `pluginRegistry.ts`

The deployed HTTP client (`src/lib/craterClient.ts`) can move into `plugins/billing/` in a follow-up; the Crater **service** remains a separate Railway deployment.
