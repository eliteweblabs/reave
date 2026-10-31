# GitHub repos — rekko naming (2026-10-31)

Public hub is **rekko.studio**. Legacy **reave.app** hostnames redirect in app middleware.

## Renamed repositories (`eliteweblabs`)

| Old name | New name |
|----------|----------|
| `reave` | [`rekko`](https://github.com/eliteweblabs/rekko) |
| `reave-connect` | [`rekko-connect`](https://github.com/eliteweblabs/rekko-connect) |
| `reave-dealership-wizard` | [`rekko-dealership-wizard`](https://github.com/eliteweblabs/rekko-dealership-wizard) |
| `reave-bridge` | [`rekko-bridge`](https://github.com/eliteweblabs/rekko-bridge) (retired; re-archived) |
| `reave-plugin-real-estate-data` | [`rekko-plugin-real-estate-data`](https://github.com/eliteweblabs/rekko-plugin-real-estate-data) |

GitHub keeps redirects from old URLs for a while; update clones:

```sh
git remote set-url origin https://github.com/eliteweblabs/rekko.git
```

## Railway

- Hub and client **`reave`** services deploy from **`eliteweblabs/rekko@main`** (service name unchanged).
- Client installs: **`REAVE_HUB_URL=https://rekko.studio`** (punch list / feature requests).
- Audit: `railway list --json` + `railway variable list … -s reave` for stale `reave.app` values.
- Optional helper: `npx tsx scripts/reconnect-railway-rekko.ts` (report; `--apply` when CLI supports connect).

## WordPress Connect

Plugin slug and update URLs stay **`/api/wp-update/reave-connect/`** so existing installs keep auto-updating. Release zips may still be named `reave-connect.zip`; download source is **`eliteweblabs/rekko-connect`**.

## Install slug vs repo

`INSTALL_CONFIG=reave` still loads `config/config-reave.json` on the hub — that is the **install slug**, not the GitHub repo name.
