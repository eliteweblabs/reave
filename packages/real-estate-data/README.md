# Real Estate Data — reΛVe.app plugin

Property intelligence tools for the reΛVe.app admin agent. Answers factual questions about U.S. properties — square footage, year built, zoning, tax/assessed values, ownership, sale history, flood zone, and comparable sales.

**Target users:** real estate agents, contractors, developers, attorneys, electricians, plumbers, inspectors, and property managers working a specific address.

## Example prompts

| User asks | Tool |
|-----------|------|
| "How many square feet is the 2nd floor of 123 Main Street, Springfield?" | `get_property_floor_area` |
| "When was 123 Main Street built?" | `get_property_year_built` |
| "Who owns 456 Oak Ave and what's the assessed value?" | `lookup_property` |
| "What are recent comps near 789 Elm St?" | `search_property_comps` |

## Quick start (standalone)

```bash
cd reave-plugin-real-estate-data
npm install
cp .env.example .env
# REAL_ESTATE_DATA_PROVIDER=mock  — works without API keys
npm run check
npm run build
```

Try the mock provider:

```bash
REAL_ESTATE_DATA_PROVIDER=mock node --experimental-strip-types test/smoke.test.ts
```

## Data providers

| Provider | Status | Best for |
|----------|--------|----------|
| **mock** | ✅ Ready | Local dev, demos (`123 Main Street`) |
| **propdata** | ✅ Adapter wired | Primary production — 166M+ parcels, comps, FEMA flood |
| **assessorsearch** | 🚧 Stub | Credit-based assessor API — mapping TBD |

Set `REAL_ESTATE_DATA_PROVIDER` and the matching API key. See [docs/API-LANDSCAPE.md](./docs/API-LANDSCAPE.md) for the full vendor comparison and roadmap.

### PropData (recommended)

```env
REAL_ESTATE_DATA_PROVIDER=propdata
PROPDATA_API_KEY=your_key
```

Docs: [propdata.proptechusa.ai/docs](https://propdata.proptechusa.ai/docs) · [RapidAPI listing](https://rapidapi.com/propdata-propdata-default/api/propdata-real-estate-market-intelligence-api)

## Agent tools

| Tool | Purpose |
|------|---------|
| `lookup_property` | Full parcel/assessor record by address or APN |
| `get_property_floor_area` | Per-floor sqft when available; honest estimate otherwise |
| `get_property_year_built` | Construction year |
| `search_property_comps` | Comparable sales (PropData) |
| `real_estate_data_status` | Provider + config diagnostics |

## Per-floor square footage — important limitation

County assessor records almost always report **total building square footage**, not per-floor breakdown. The plugin:

1. Returns exact per-floor sqft when the provider supplies `floorAreas` (rare).
2. Otherwise estimates even split across `stories` and labels the result clearly.
3. Never presents an estimate as assessor-verified data.

Future phases may add building permit APIs, MLS/listing feeds, or uploaded floor plans for true per-floor data.

## Integrate with reΛVe.app

This repo is designed to install into the main app as a git submodule or npm package:

```
reave-1/plugins/real-estate-data/   ← symlink or submodule to this repo
```

Required core changes (one-time):

1. Add `real_estate_data` to `FEATURE_IDS` in `src/lib/features.ts`
2. Import `realEstateDataPlugin` in `src/lib/pluginRegistry.ts`
3. Register knowledge slug `real-estate-data` in `pluginKnowledgeSlugs()`
4. Enable in `config/config-{slug}.json` → `"features": ["real_estate_data", ...]`
5. Set env vars on Railway

When bundled, pass Reave's `hasFeature` into the module:

```typescript
import { hasFeature } from '../../src/lib/features';
import { createRealEstateDataModule } from './agentTools';

export const realEstateDataModule = createRealEstateDataModule({ hasFeature });
```

See [docs/INTEGRATION.md](./docs/INTEGRATION.md) for step-by-step wiring.

## Layout

```
├── manifest.ts          # ReavePlugin export
├── agentTools.ts        # AgentToolModule + tool handlers
├── knowledge/           # Agent playbook (bundled markdown)
├── lib/
│   ├── config.ts
│   ├── propertyService.ts
│   └── providers/       # mock | propdata | assessorsearch
└── docs/
    ├── API-LANDSCAPE.md
    └── INTEGRATION.md
```

## License

Proprietary — reΛVe.app ecosystem. Adjust as needed for your org.
