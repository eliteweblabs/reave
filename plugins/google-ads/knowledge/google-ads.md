# Google Ads agent playbook

## When to use

- Provisioning or auditing **Search** campaigns tied to geo landing pages
- Dr. Paws Calls: bulk town ad groups → `/vet/{town}` (`google_ads_provision_dr_paws_geo`)
- Pulling spend/clicks/conversions rolled up by final URL

## Setup order

1. `google_ads_status` — confirm OAuth, developer token, customer id
2. If not connected: admin visits `/api/admin/google-ads/connect`
3. If customer id missing: `google_ads_list_accessible_customers` then `google_ads_set_customer_id`
4. Always **dry_run first** on mutations

## Campaign structure (Search / geo)

```
Campaign (PAUSED, daily budget)
├── Ad group: {Town} — House Calls
│   ├── Keywords (PHRASE): vet house call {town}, mobile vet {town}, …
│   ├── Negative keywords: emergency, 24 hour, cheap, free
│   └── RSA → final URL /vet/{slug}
└── Campaign negatives: jobs, salary, school, training
```

**Bid strategy:** Manual CPC ($2.50 default ad-group bid) — switch to Maximize Conversions in UI after conversion tracking is verified.

## Performance sync

`google_ads_campaign_performance` returns:

- Row-level ad group metrics
- `landingPageRollup` — cost/clicks/conversions grouped by `finalUrl`

Map `/vet/longmeadow` etc. to `src/lib/drPawsAdsTowns.ts` slugs.

## Rate limits & errors

- Client retries RESOURCE_EXHAUSTED / transient errors (3 attempts, backoff)
- Do not invent metrics — if a tool returns `GOOGLE_ADS_FAILED`, report the reason and stop

## Do not

- Enable live campaigns (`status=ENABLED`) without owner approval
- Mutate with `confirm=true` unless dry_run output was reviewed
- Run write tools when `google_ads_status` shows disconnected
