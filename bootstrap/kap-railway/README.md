# kap-railway

Kap plugin that uploads screen recordings to your [Reave](https://reave.app) app on Railway and returns a **permanent tokenized URL** (`/r/{token}`).

## Server setup (Reave on Railway)

1. Generate a long random upload key, e.g. `openssl rand -hex 32`
2. Set on the Reave service:

   ```env
   KAP_UPLOAD_KEY=your-secret-here
   ```

3. Deploy. Uploads go to `POST /api/kap/upload`; shares use `GET /r/{token}` (never expires).

## Install the Kap plugin

Kap loads plugins from `~/Library/Application Support/Kap/plugins`.

### Option A — local link (development)

```sh
cd bootstrap/kap-railway
npm install
npm link

mkdir -p ~/Library/Application\ Support/Kap/plugins
cd ~/Library/Application\ Support/Kap/plugins
npm init -y
npm link kap-railway
```

Add `"kap-railway": "latest"` to `dependencies` in that folder's `package.json`, then restart Kap.

### Option B — Kap Preferences

If published to npm, open Kap → **Preferences → Plugins**, search for `kap-railway`, and install.

## Plugin settings

| Field | Value |
|-------|--------|
| **Base URL** | Your Reave public URL, e.g. `https://reave.app` |
| **Upload key** | Same value as `KAP_UPLOAD_KEY` on Railway |

## Usage

1. Record in Kap
2. Choose export format (GIF, MP4, WebM, or APNG)
3. Click **Share on Reave**
4. The tokenized URL is copied to your clipboard — paste in Slack, GitHub, docs, etc.

Anyone with the link can view the recording; there is no separate login. Links do not expire unless you delete the row from `kap_recordings` in Postgres.

## Limits

- Max file size: 25 MB
- Supported types: GIF, APNG, MP4, WebM
