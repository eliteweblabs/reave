# API landscape — Real Estate Data plugin

Rough survey of U.S. property data sources suitable for agent tools. This plugin uses a **provider adapter** pattern so we can swap or combine vendors without changing agent tool signatures.

## What users actually ask for

| Category | Example questions | Typical data source |
|----------|-------------------|---------------------|
| **Structure** | Sqft, beds/baths, stories, year built, basement | County assessor / parcel roll |
| **Per-floor area** | "2nd floor sqft" | Rare in assessor data; permits, MLS, floor plans |
| **Lot** | Lot size, zoning, land use | Assessor + municipal GIS |
| **Ownership** | Owner name, mailing address, absentee flag | Assessor |
| **Valuation** | Assessed value, market value, last sale | Assessor + recorder |
| **Tax** | Annual tax, tax year | Assessor |
| **Risk** | Flood zone (FEMA), fire, environmental | FEMA, state GIS |
| **Market** | Comps, rent estimate, days on market | MLS aggregators, PropData, Redfin-style APIs |
| **Permits** | Renovation history, electrical/plumbing permits | City open data (fragmented) |
| **Legal** | Easements, liens, title | Title companies (expensive, not in v1) |

## Tier 1 — Recommended for v1 production

### PropData

- **URL:** https://propdata.proptechusa.ai/docs
- **Coverage:** 166M+ U.S. parcels, 16 merged data layers
- **Key endpoints:** `GET /v1/property`, `GET /v1/comps`, `GET /v1/geocode`, `GET /v1/market`
- **Fields:** owner, mailing, market/assessed value, tax, beds/baths/sqft, year built, sale history, FEMA flood, absentee/vacant flags
- **Pricing:** RapidAPI tiers + direct plans
- **Why first:** Single REST surface, MCP docs exist, agent-friendly JSON, comps included
- **Gap:** No per-floor sqft; no permit history in base parcel lookup

### AssessorSearch

- **URL:** https://assessorsearch.com/property-data-api
- **Coverage:** U.S. property records, credit-based
- **Key endpoint:** `GET /v1/properties?address=...` (1 credit per match)
- **Fields:** `year_built`, `sqft`, `living_area_sqft`, `lot_size_sqft`, zoning, land use, owner, tax
- **Why consider:** Clean field names, explicit credit model, good for high-confidence core facts
- **Status in plugin:** Stub — needs live key to finish response mapping

## Tier 2 — Specialized / phase 2

| Vendor | Strength | Notes |
|--------|----------|-------|
| **AddressVerify.io** | Residential validation + beds/baths/sqft/year built | Good for lead gen / wholesaling filters |
| **BatchData** | Bulk skip trace + property filters | Heavy for single-address agent lookups |
| **ATTOM Data** | Enterprise parcel + mortgage + foreclosure | Expensive; legal/compliance review |
| **CoreLogic / Black Knight** | Mortgage, valuation models | Enterprise only |
| **RentCast / Zillow-style** | Rent + AVM estimates | Estimates ≠ assessor facts — label carefully |
| **Regrid** | Parcel boundaries (GeoJSON) | Pair with PropData for lot maps |
| **Building permit APIs** | Per-city open data (Socrata, ArcGIS) | High value for contractors; needs city resolver |

## Tier 3 — Not API-first (manual / future)

- **Floor plans:** Often in MLS listing photos, appraiser sketches, or uploaded project docs — consider reΛVe.app **Documents** integration
- **Easements / covenants:** County recorder PDFs — OCR + RAG later
- **Inspection reports:** User-uploaded; not public API

## Provider selection guide

```
REAL_ESTATE_DATA_PROVIDER=mock          # dev / demo
REAL_ESTATE_DATA_PROVIDER=propdata      # production default
REAL_ESTATE_DATA_PROVIDER=assessorsearch # alternative assessor-only
```

Future: `composite` provider that tries PropData first, falls back to AssessorSearch, merges with highest-confidence fields.

## Data integrity rules (agent playbook)

1. **Never invent** owner names, sqft, or year built — return `null` + `missing_fields` when absent.
2. **Label estimates** — per-floor sqft from even-split must say "estimated".
3. **Cite source** — every tool response includes `provider` and `matchLevel` when available.
4. **U.S. only in v1** — international property data is out of scope until a provider is chosen.

## Roadmap

- [x] Provider abstraction + mock + PropData adapter
- [ ] AssessorSearch response mapping (needs API key)
- [ ] Geocode → normalize address before lookup
- [ ] Cache layer (Cloudflare KV / Postgres) keyed by parcel id
- [ ] Permit lookup by city + address (Socrata adapter)
- [ ] Link property results to reΛVe.app **Contacts** / **Projects** by address
- [ ] Admin settings UI for provider + API key (today: env vars only)
