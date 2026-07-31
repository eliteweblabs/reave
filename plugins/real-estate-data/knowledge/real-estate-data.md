# Real Estate Data — agent playbook

## Property facts
Use `lookup_property`, `get_property_year_built`, `get_property_floor_area` for assessor-backed facts.

## Compliance & liability
- `get_property_compliance_timeline` — age + state lifecycle items (roof, panel, plumbing, HVAC, lead paint, septic, smoke/CO).
- `get_property_hazard_profile` — flood zone, wildfire context.
- `lookup_code_violations` — open municipal violations when available.
- `assess_property_liability` — full Property Liability Radar with trade-specific lead score.

## Lead scanner (cron)
Admin → **Lead Scanner** configures:
- **Geofence center** (map or company office)
- **Radius** (travel miles)
- **Trades** (plumbing, roofing, etc.)
- **Daily scan hour** (default 6 AM local)

Cron: `GET /api/lead-scanner/poll?key=LEAD_SCANNER_POLL_SECRET`

New leads become **inquiry projects** tagged `lead-scanner` with owner contact resolved from assessor data.

## Disclaimers
Informational only — not legal advice. Per-floor sqft may be estimated. Insurance claims are not public data.
