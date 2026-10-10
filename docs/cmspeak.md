# CMSpeak (sibling repo)

**GitHub:** [eliteweblabs/cmspeak](https://github.com/eliteweblabs/cmspeak)

CMSpeak is the **agent CMS overlay** — separate Astro service (Clerk, JSON content, live edit pencil, rewrite agent). Public marketing sites stay in their own `{slug}-site` repos; they load copy from CMSpeak and embed `cmspeak.js`.

Reave’s **`content_management`** plugin is different: Git publish to the website repo via the admin agent (`write_github_file`). CMSpeak is for in-browser editing on the live site, not Git-based content.

## Local layout

CMSpeak is a **git submodule** in this repo:

```sh
git clone https://github.com/eliteweblabs/reave.git
cd reave
git submodule update --init --recursive
```

Or after pulling Reave when the submodule was added:

```sh
git submodule update --init cmspeak
```

| Repo     | Path in checkout | Dev port |
|----------|------------------|----------|
| Reave    | repo root        | 4321     |
| CMSpeak  | `cmspeak/`       | 4322     |

Upstream only: [https://github.com/eliteweblabs/cmspeak](https://github.com/eliteweblabs/cmspeak)

Open **`reave.code-workspace`** in Cursor so both roots are in one window (Reave + CMSpeak).

## Connect a public site

1. Register the site in `cmspeak/content/registry.json` (slug, production origin, localhost origin).
2. Seed `cmspeak/content/sites/{slug}.json`.
3. On the website: `GET {CMSPEAK_URL}/api/sites/{slug}/content` and `<script src="{CMSPEAK_URL}/cmspeak.js" data-cmspeak-site="{slug}">`.
4. Railway: deploy CMSpeak as its own service; set `PUBLIC_CMSPEAK_URL`, volume on `CMS_DATA_DIR`, Clerk + `CMS_TOKEN_SECRET`.

See the CMSpeak repo **README** for env vars and markup (`data-edit-path`, lists).

## First connected install

**The Barber's Edge** (`barbers-edge`) is registered in CMSpeak today; their site reads `CMSPEAK_URL` from Railway.
