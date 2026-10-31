# Christian Gonzalez — Railway project

**Solo barber stack** ([`eliteweblabs/solo-barber-stack`](https://github.com/eliteweblabs/solo-barber-stack)) — same package as Steven Diaz. Site service deploys from that repo (Christian uses branch **`christian-gonzalez`** for his homepage + cal menu; Steven uses **`main`**).

| | |
|---|---|
| **Workspace** | re>\|<o studio (`c8d49e41-05f3-42ee-bf1d-3fc946a00a1a`) |
| **Project** | Christian Gonzalez (`74463066-704a-4656-8260-07d5fdba86c6`) |
| **Environment** | production (`e018980e-ed14-48e9-804f-61274420b60e`) |
| **Install slug** | `christian-gonzalez` |
| **Site repo / branch** | `eliteweblabs/solo-barber-stack` → **`christian-gonzalez`** |
| **Public site** | https://christian-gonzalez-site-production.up.railway.app |
| **Cal.com** | https://christian-gonzalez-cal-production.up.railway.app |

## Required services (solo stack)

| Service | Role |
|---------|------|
| `christian-gonzalez-site` | Astro — marketing, `/book`, `/admin`, `/setup` (this repo) |
| `christian-gonzalez-cal` | Self-hosted Cal.com |
| `christian-gonzalez-db` | Postgres shared by Cal + site (`CALCOM_DATABASE_URL`) |

Optional later: `{slug}-api`, `{slug}-app` (see Steven Diaz).

## Legacy reΛVe canvas (retire after cutover)

These were the old slim-hub stack; stop deploying once the solo stack is verified:

`reave`, `reave-postgres`, `contact-api`, `contact-postgres`, `calcom-*`, `crater*`.

## Install / wire

From **solo-barber-stack** (see [docs/christian-gonzalez-solo-stack.md](https://github.com/eliteweblabs/solo-barber-stack/blob/christian-gonzalez/docs/christian-gonzalez-solo-stack.md)):

```bash
export RAILWAY_API_TOKEN=…
npm run install:wire -- --project "Christian Gonzalez" --slug christian-gonzalez --bootstrap-shared
npm run install:sync-cal -- --project "Christian Gonzalez"
```

Site needs Clerk **Development** keys on `christian-gonzalez-site`, volume at `/data`, and a Cal.com user `@christian-gonzalez` (finish Cal signup or run sync after first admin exists).

## DNS (later)

- Apex → `christian-gonzalez-site`
- Owners use `/admin` on the site URL until a custom domain is on Clerk Production.
