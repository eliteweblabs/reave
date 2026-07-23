# Reave Plugins

Self-contained feature packages. Each plugin owns its **knowledge**, optional **agent tools**, and (when extracted) its integration client code.

Reave core (`src/knowledge/`) holds **generic product mechanics only**. Plugin playbooks never live there.

## Layout

```
plugins/{id}/
├── manifest.ts       # feature gate, configured(), agentTools export
├── knowledge/        # bundled markdown playbooks (?raw glob)
│   └── installs/     # optional install-scoped docs
└── agentTools.ts     # optional Admin → Chats tool module
```

## Registered plugins

| Directory | Feature | Knowledge | Agent tools |
|-----------|---------|-----------|-------------|
| `billing/` | `billing` | `crater-billing.md` | yes |
| `carddav/` | `carddav` | `carddav.md` | — |
| `client-portal/` | `client_portal` | `client-portal.md` | yes |
| `code-dev/` | `code_dev` | install-scoped `code-dev-tools.md` | yes |
| `dev-infra/` | `dev_infra` | github, kinsta, railway playbooks | yes |
| `email-marketing/` | `email_marketing` | `newsletter.md` | — |
| `scheduling/` | `scheduling` | — | yes |
| `site-audits/` | `site_audits` | — | yes |
| `site-monitoring/` | `site_monitoring` | — | yes |
| `uptime-monitoring/` | `uptime_monitoring` | `uptime-monitoring.md` | yes |
| `fleet/` | `fleet_tracking` | `fleet-tracking.md` | yes |
| `paulino-wizard/` | `dealership_wizard` | `paulino-wizard.md` | yes |
| `vapi/` | `vapi` | — | yes |
| `svg-operations/` | *(utility)* | — | — |

Enable a plugin in `config/config-{slug}.json` → `"features": ["billing", ...]`.

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

## Utility plugins

`svg-operations/` is a standalone npm package (no feature gate). Wire it through a manifest when integrated into the admin agent or API.
