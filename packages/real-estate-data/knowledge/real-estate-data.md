# Real Estate Data — agent playbook

Use these tools when a user asks factual questions about a **specific U.S. property address** — square footage, year built, zoning, owner, tax, sale history, flood zone, or comparable sales.

## When to use which tool

| Question pattern | Tool |
|------------------|------|
| General property facts | `lookup_property` |
| "When was it built?" / construction year | `get_property_year_built` |
| "How big is the 2nd floor?" / per-floor sqft | `get_property_floor_area` |
| Comps / recent sales nearby | `search_property_comps` |
| Is the plugin configured? | `real_estate_data_status` |

Always collect **street address, city, state, and ZIP** when the user omits them. Normalize abbreviations (St → Street) before calling tools.

## Per-floor square footage

County assessor databases rarely store per-floor areas. The plugin may return:

- **`floor_areas`** — exact per-floor data from the provider (uncommon)
- **`estimated_even_split`** — total sqft ÷ number of stories; **must tell the user this is an estimate**
- **`total_building_only`** — only whole-building sqft available; cannot answer a specific floor without estimating

Never present an estimate as official assessor data.

## Industries & typical needs

| Role | Common facts |
|------|----------------|
| Real estate agent | Beds/baths, sqft, year built, comps, last sale |
| Contractor / developer | Lot size, zoning, year built, stories, assessed value |
| Attorney | Owner of record, mailing address, sale history, parcel id |
| Electrician / plumber | Year built, stories, property type (often needs permits — not in v1) |
| Inspector | Year built, sqft, flood zone, lot size |

If the user needs **permits, liens, easements, or floor plans**, say what is not in the current data source and suggest uploading documents to the project or checking the municipal permit portal.

## Response quality

- Include `provider` and note any `missing_fields`.
- If no match: suggest verifying the address or providing parcel/APN.
- U.S. addresses only in v1.

## Example flow

User: *"How many square feet is the 2nd floor of 123 Main Street, Springfield?"*

1. Call `get_property_floor_area` with address + city/state if known.
2. If `source` is `estimated_even_split`, explain: assessor shows total building sqft and N stories; per-floor is estimated.
3. Offer `lookup_property` for full record if they need more context.
