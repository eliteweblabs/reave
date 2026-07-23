# Bootstrap services

Standalone GitHub repos and Railway services that integrate with Reave App.

## materials-api

Source for **eliteweblabs/materials-api** — retail materials pricing.

```sh
cd bootstrap/materials-api
git init && git add -A && git commit -m "Initial materials-api"
gh repo create eliteweblabs/materials-api --public --source=. --remote=origin --push
```

See `bootstrap/materials-api/README.md` and `src/knowledge/materials-api-reference.md`.

## fleet-api

Source for **eliteweblabs/fleet-api** — multi-vehicle GPS tracking for businesses.

```sh
cd bootstrap/fleet-api
git init && git add -A && git commit -m "Initial fleet-api"
gh repo create eliteweblabs/fleet-api --public --source=. --remote=origin --push
```

Railway setup:

1. Reave App project → **New service** → connect `eliteweblabs/fleet-api`
2. Add Postgres → `DATABASE_URL`
3. Set `API_KEY` (shared variable)
4. On Astro: `FLEET_API_BASE_URL=https://${{ fleet-api.RAILWAY_PUBLIC_DOMAIN }}`
5. Enable `"fleet_tracking"` in install config

See `bootstrap/fleet-api/README.md` and `src/knowledge/fleet-api-reference.md`.
