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

  **Important:** This repo’s Railway CLI may be linked to **Reave Demo** (`reave-production.up.railway.app`) — a separate project with empty databases. Production lives on **Reave App** (`reave.app`). Always run `npm run sync:env` so `.env` targets Reave App’s public Postgres proxy, not Demo.

## Other repos on the same Railway project

The **Reave App** Railway project also deploys separate services (e.g. Crater at `ap.reave.app`) from **their own** GitHub repos. If you need to change that software, clone that repo from GitHub the same way — not from Railway.
