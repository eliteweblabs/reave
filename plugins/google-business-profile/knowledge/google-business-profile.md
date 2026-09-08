# Google Business Profile — Agent Playbook

Manage the owner's Google Business Profile (GBP) directly from the agent via the `google_business_profile` tool.

## Setup (one-time)

1. `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` must be set (same Cloud project used for Search Console / GA4).
2. Visit **Admin → Company → Hours** and click **Connect Google Business Profile** to authorize the `business.manage` OAuth scope.
3. Call `google_business_profile { action: "status" }` to confirm connection + list locations.
4. Call `google_business_profile { action: "select_location", location_id: "locations/…" }` to save the active location.

## Tool actions

| Action | Purpose |
|---|---|
| `status` | OAuth status, API probe, location list, selected location |
| `list_locations` | All GBP locations across all accounts |
| `get_location` | Full read — name, phone, website, hours, address, categories |
| `update_location` | PATCH fields (update_mask + payload required) |
| `sync_hours` | Push company hours → GBP regularHours |
| `select_location` | Save active location for future syncs |

## Common update patterns

### Update website URL
```json
{
  "action": "update_location",
  "location_id": "locations/12345678",
  "update_mask": "websiteUri",
  "payload": { "websiteUri": "https://example.com" }
}
```

### Update primary phone
```json
{
  "action": "update_location",
  "location_id": "locations/12345678",
  "update_mask": "phoneNumbers",
  "payload": { "phoneNumbers": { "primaryPhone": "+18631234567" } }
}
```

### Update business name
```json
{
  "action": "update_location",
  "location_id": "locations/12345678",
  "update_mask": "title",
  "payload": { "title": "Elite Web Labs" }
}
```

### Update regular hours
```json
{
  "action": "update_location",
  "location_id": "locations/12345678",
  "update_mask": "regularHours",
  "payload": {
    "regularHours": {
      "periods": [
        { "openDay": "MONDAY", "openTime": { "hours": 9 }, "closeDay": "MONDAY", "closeTime": { "hours": 17 } },
        { "openDay": "TUESDAY", "openTime": { "hours": 9 }, "closeDay": "TUESDAY", "closeTime": { "hours": 17 } }
      ]
    }
  }
}
```

## Notes

- The `update_mask` is required for PATCH — only listed fields are written; others are untouched.
- `sync_hours` uses the company hours from Admin → Company → Hours and calls the same sync endpoint used by the UI.
- GBP API access requires the project to be approved for **Basic API Access** on Google Cloud. If you get a `GBP_API_NOT_APPROVED` error, apply at https://business.google.com/locations/manage then retry.
- The `google_workspace` feature gate must be on (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` set) for this tool to appear.
