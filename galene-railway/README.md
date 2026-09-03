# Galene on Railway

Self-hosted [Galene](https://galene.org/) video conferencing in a **single Docker container**, tuned for [Railway](https://railway.com/) automatic deploys.

Includes **coturn** (TCP-only) so WebRTC works on Railway, which does not expose inbound UDP.

## Why Galene (not Jitsi) here

| | Galene (this repo) | Jitsi Meet |
|---|---|---|
| Services | 1 container | 4+ (web, prosody, jicofo, jvb, …) |
| Railway fit | HTTP + one TCP proxy | Multiple UDP/TCP ports, complex linking |
| Ops | Minimal env vars | Manual service wiring, shared secrets |
| Features | Rooms, chat, screen share, recording | Full Jitsi feature set |

See [docs/JITSI-ALTERNATIVE.md](docs/JITSI-ALTERNATIVE.md) if you need Jitsi anyway.

## One-click deploy

**Standalone repo:** fork or copy `galene-railway/` to its own GitHub repository, then:

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template?template=https://github.com/eliteweblabs/reave&rootDirectory=galene-railway)

**From this monorepo:** Railway → New Service → GitHub → `eliteweblabs/reave` → set **Root Directory** to `galene-railway`.

### Manual deploy

1. **New GitHub repo** — push this folder as the repository root (or fork).
2. **Railway** → New Project → Deploy from GitHub → select the repo.
3. Railway detects `railway.json` / `Dockerfile` and builds automatically.
4. **Networking** → Generate Domain (HTTPS).
5. **Variables** — set at minimum:

   | Variable | Example | Purpose |
   |----------|---------|---------|
   | `GALENE_ADMIN_PASSWORD` | strong secret | Server admin / galenectl |
   | `GALENE_GROUP_PASSWORD` | strong secret | Moderator login for default room |
   | `GALENE_TURN_PASSWORD` | strong secret | TURN credentials (must match coturn) |

6. **TCP proxy for TURN** (required for reliable video on most networks):
   - Service → **Settings** → **Networking** → **TCP Proxy**
   - Application port: **`1194`**
   - Copy the public `host:port` Railway shows (e.g. `maglev.proxy.rlwy.net:57891`)
   - Add variable: `GALENE_TURN_PUBLIC=maglev.proxy.rlwy.net:57891`
   - Redeploy

7. Open `https://<your-domain>/group/meet/` — sign in as user **`host`** with `GALENE_GROUP_PASSWORD`.

### Optional: persistent volume

Attach a Railway volume mounted at **`/data`** to keep:

- `config.json`, room definitions, recordings
- Generated TURN secret (`turn-secret`) across redeploys

Without a volume, rooms and secrets are recreated on each deploy (fine for demos).

## Environment variables

### Required for production

| Variable | Description |
|----------|-------------|
| `GALENE_ADMIN_PASSWORD` | Admin password for `GALENE_ADMIN_USERNAME` (default `admin`) |
| `GALENE_TURN_PUBLIC` | Public `hostname:port` from Railway **TCP Proxy** (port **1194** inside container) |

### Strongly recommended

| Variable | Default | Description |
|----------|---------|-------------|
| `GALENE_GROUP_PASSWORD` | `meet` (auto-generated on first boot if unset in template) | Moderator password for default `/group/meet/` |
| `GALENE_TURN_PASSWORD` | random, persisted on `/data` | TURN shared secret |
| `GALENE_TURN_USERNAME` | `galene` | TURN username |

### Auto-set by Railway

| Variable | Description |
|----------|-------------|
| `PORT` | HTTP listen port (entrypoint binds Galene here) |
| `RAILWAY_PUBLIC_DOMAIN` | Used to build `proxyURL` when `GALENE_PUBLIC_URL` is unset |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `GALENE_PUBLIC_URL` | `https://${RAILWAY_PUBLIC_DOMAIN}/` | Canonical public URL (trailing slash) |
| `GALENE_CANONICAL_HOST` | host from public URL | Redirects mistyped hostnames |
| `GALENE_ADMIN_USERNAME` | `admin` | Server admin username |
| `GALENE_DEFAULT_GROUP` | `meet` | Default room name |
| `GALENE_RELAY_ONLY` | `1` | Force TURN relay (keep `1` on Railway) |
| `GALENE_UDP_MUX_PORT` | `50000` | Single UDP mux port for SFU media inside container |
| `GALENE_TURN_LISTEN_PORT` | `1194` | coturn TCP listen port (match TCP proxy app port) |

## Local testing

```bash
cp .env.example .env
# edit passwords in .env
docker compose up --build
```

Open http://localhost:8080/group/meet/ — moderator **host** / password from `GALENE_GROUP_PASSWORD`.

Local compose maps TCP **1194** so `GALENE_TURN_PUBLIC=localhost:1194` works without Railway.

## Repository layout

```
.
├── Dockerfile              # Galene (Go) + coturn (Alpine)
├── docker-entrypoint.sh    # PORT, config.json, ICE, coturn startup
├── docker-compose.yml      # Local HTTP + TURN
├── railway.json            # Railway build + health check
├── railway.toml            # Same settings (TOML variant)
├── .env.example            # Documented variables
├── groups/meet.json        # Seed default room
└── docs/JITSI-ALTERNATIVE.md
```

## Default room behavior

- **Public** room listed on the landing page: `/group/meet/`
- **Moderator**: username `host`, password from `GALENE_GROUP_PASSWORD`
- **Guests**: wildcard user — any username, any password (open join). Lock down by editing `groups/meet.json` on the volume or using `galenectl`.

## Administering rooms

With a public URL and admin password:

```bash
galenectl -server https://your-domain/ -user admin -password "$GALENE_ADMIN_PASSWORD" list-groups
galenectl -server https://your-domain/ -user admin create-group -group team-standup
```

Or edit JSON under `/data/groups/` on the volume.

## Railway limitations

- **No inbound UDP** — this image uses **TURN over TCP** only. You must add the TCP proxy on port **1194** and set `GALENE_TURN_PUBLIC`.
- **Single region** — all participants relay through that region; fine for small teams, not a global SFU fleet.
- **TCP media** — slightly higher latency than UDP; acceptable for meetings, less ideal for large broadcasts.

## Fork as standalone repo

This directory is self-contained. To publish separately:

```bash
cd galene-railway
git init
git add .
git commit -m "Initial Galene Railway deploy template"
git remote add origin git@github.com:YOU/galene-railway.git
git push -u origin main
```

Update the Deploy on Railway button URL in `README.md` to your GitHub path.

## License

Galene is Copyright © Juliusz Chroboczek — see [upstream license](https://github.com/jech/galene). Deployment files in this repository are MIT-licensed.
