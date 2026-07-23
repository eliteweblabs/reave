# materials-api bootstrap

Source for the standalone **eliteweblabs/materials-api** GitHub repo and Railway service.

## Publish to GitHub

From a machine with org repo-create access:

```sh
cd bootstrap/materials-api
git init && git add -A && git commit -m "Initial materials-api"
gh repo create eliteweblabs/materials-api --public --source=. --remote=origin --push
```

## Deploy to Railway

1. Reave App project → **New service** → connect `eliteweblabs/materials-api`
2. Set provider API keys (`UNWRANGLE_API_KEY`, `BIGBOX_API_KEY`, or `SERPAPI_API_KEY`)
3. Set `API_KEY` (or use a shared variable)
4. On Astro: `MATERIALS_API_BASE_URL=https://${{ materials-api.RAILWAY_PUBLIC_DOMAIN }}`

See `README.md` in this folder and `src/knowledge/materials-api-reference.md` in the reave repo.
