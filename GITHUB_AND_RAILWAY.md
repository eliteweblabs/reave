# GitHub + Railway workflow

**Code lives in GitHub.** Railway builds and runs what is on the default branch of the linked repo — it does not replace Git.

## Day to day

1. **Sync your machine with the team** — pull (or rebase) from GitHub:
   ```sh
   git fetch origin && git pull origin main
   ```
2. **Install and run locally** (after a fresh clone or when dependencies change):
   ```sh
   npm ci
   ```
   Create a `.env` in the repo root with the variables described in [README.md](README.md), or run `npm run railway:vars` after `railway link` and copy what you need from `.env.railway` into `.env`.
   ```sh
   npm run dev
   ```
3. **Ship changes** — commit, push to GitHub; Railway auto-deploys from the repo Railway has connected (this project: `eliteweblabs/reave` → **Reave App** / **Astro** on Railway).

## First-time clone (new folder)

```sh
git clone https://github.com/eliteweblabs/reave.git
cd reave
npm ci
```

Then add `.env` with the keys your app needs (see [README.md](README.md)). Do not commit `.env`.

## Railway CLI (optional)

Use the CLI for **deployments, logs, and variables** — not as a substitute for `git`.

- **One-time link** (from this repo root), if you want `railway status`, `railway logs`, etc.:
  ```sh
  railway link -p af65eb9a-b11c-4c1c-8030-66b4347dcf71 -e production -s 0ef02496-5250-4314-a079-34a4c399f430
  ```
  (IDs are for **Reave App** → **production** → **Astro**; you can also run `railway link` interactively.)

- **Run dev with production env injected** (no file copy):
  ```sh
  railway run -- npm run dev
  ```
  **Do not use this for day-to-day local admin work.** It injects Railway’s *internal* URLs (`*.railway.internal`), which do not resolve on your Mac. Use `npm run sync:env` + plain `npm run dev` instead.

- **Snapshot variables to a local file** (file is gitignored):
  ```sh
  npm run railway:vars
  ```
  Then merge what you need into `.env` for offline work, or run:
  ```sh
  npm run sync:env      # pulls Reave App (reave.app) prod keys + public DATABASE_URL
  ```
  Local dev uses `PUBLIC_BOOKING_API_URL` for Cal.com (not the Railway-private `BOOKING_API_URL`).

  **Important:** Local dev should target **Reave App** production (`reave.app`), not the live demo install. Always run `npm run sync:env` so `.env` uses Reave App’s public Postgres proxy.

## Reave Demo (live sandbox)

Separate Railway project — **not** production. Do not point `npm run sync:env` at this project.

| | Reave App (production) | Reave Demo (sandbox) |
|---|---|---|
| Project | **reΛVe.app Automation** `af65eb9a-b11c-4c1c-8030-66b4347dcf71` | **reΛVe.app App Demo** `350f3d35-6afc-47a4-bcf5-d9753abb78f2` |
| Service | `reave` `0ef02496-5250-4314-a079-34a4c399f430` | `reave` `38902411-adf1-48ca-bff9-8346390897f9` |
| Public URL | `https://reave.app` | `https://demo.reave.app` (custom) · `https://reave-production-e6ab.up.railway.app` (Railway) |
| Config | `INSTALL_CONFIG=production` | `INSTALL_CONFIG=demo`, `DEMO_MODE=1` |

CLI (must pass `--project` so you do not hit production):

```sh
railway domain demo.reave.app --service reave \
  --project 350f3d35-6afc-47a4-bcf5-d9753abb78f2 \
  --environment production
```

Custom domain `demo.reave.app` needs **both** a CNAME and a Railway TXT verification record in Cloudflare (`reave.app` zone). Copy exact values from Railway → reΛVe.app App Demo → `reave` → Settings → Networking → `demo.reave.app`. Until the TXT record verifies, the custom domain returns 404 even if the CNAME resolves.

## Backups (pre-production / contingency)

Production data lives in **multiple Postgres services** on Railway (`reave-postgres`, `contact-postgres`, Crater, Cal.com, fleet-api). GitHub only holds application code.

Before a sale or major launch, walk through **[docs/pre-production-contingency-audit.md](docs/pre-production-contingency-audit.md)** — enable Railway volume backups + PITR, schedule offsite `pg_dump`, and run a restore drill.

Manual dump of the app database (after `npm run sync:env`):

```sh
npm run backup:postgres
```

Output goes to `backups/` (gitignored). For `contact-postgres`, pull `DATABASE_PUBLIC_URL` from that service in Railway and run `BACKUP_LABEL=contact-postgres DATABASE_URL='…' npm run backup:postgres`.

## Other repos on the same Railway project

The **Reave App** Railway project also deploys separate services (e.g. Crater at `ap.reave.app`) from **their own** GitHub repos. If you need to change that software, clone that repo from GitHub the same way — not from Railway.
