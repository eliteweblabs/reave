# Integrating Real Estate Data into reave.app

## Install the plugin

**Option A — Git submodule (recommended during development)**

```bash
cd /path/to/reave-1
git submodule add git@github.com:YOUR_ORG/reave-plugin-real-estate-data.git plugins/real-estate-data
```

**Option B — npm package (when published)**

```bash
npm install @reave/plugin-real-estate-data
# symlink or copy manifest into plugins/real-estate-data/
```

**Option C — Copy folder** for quick experiments.

## Core registration (required today)

Reave does not auto-discover plugins. Apply these one-time changes in `reave-1`:

### 1. Feature ID — `src/lib/features.ts`

```typescript
export const FEATURE_IDS = [
  // ...existing
  'real_estate_data',
] as const;
```

### 2. Plugin registry — `src/lib/pluginRegistry.ts`

```typescript
import { realEstateDataPlugin } from '../../plugins/real-estate-data/manifest';

export const REAVE_PLUGINS: ReavePlugin[] = [
  // ...existing
  realEstateDataPlugin,
];
```

In `pluginKnowledgeSlugs()`:

```typescript
case 'real-estate-data':
  return ['real-estate-data'];
```

### 3. Wire `hasFeature` when bundled

In `plugins/real-estate-data/agentTools.ts` (thin wrapper):

```typescript
import { hasFeature } from '../../src/lib/features';
import { createRealEstateDataModule } from '@reave/plugin-real-estate-data/agentTools';

export const realEstateDataModule = createRealEstateDataModule({ hasFeature });
```

Or re-export from manifest if paths resolve directly.

### 4. Install config

`config/config-reave.json` (or your install slug):

```json
{
  "features": ["real_estate_data", "..."]
}
```

### 5. Environment variables (Railway)

```env
REAL_ESTATE_DATA_PROVIDER=propdata
PROPDATA_API_KEY=...
```

For local dev without keys:

```env
REAL_ESTATE_DATA_PROVIDER=mock
REAL_ESTATE_DATA_ENABLED=1
```

### 6. Optional — OS map node

Add a node to `public/admin/os-map-data.js` under the **system** map when the plugin ships to production.

### 7. Optional — slash command

In `src/lib/agentHelperCommands.ts`:

```typescript
{
  command: '/property',
  label: 'Property lookup',
  feature: 'real_estate_data',
  prompt: 'Look up property facts for: ',
}
```

## Verify

1. Enable feature in install config
2. Set `REAL_ESTATE_DATA_PROVIDER=mock`
3. In Admin → Chats, ask: *"When was 123 Main Street, Springfield built?"*
4. Agent should call `get_property_year_built` or `lookup_property`

Run `real_estate_data_status` via agent to confirm provider wiring.

## Health check (future)

Add to `src/pages/api/health.ts`:

```typescript
import { isRealEstateDataConfigured } from '../../plugins/real-estate-data/lib/config';
// report real_estate_data: { configured: isRealEstateDataConfigured() }
```
