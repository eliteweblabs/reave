# kap-railway

Kap plugin that uploads screen recordings to your [Reave](https://reave.app) app on Railway and returns a **permanent tokenized URL** (`/r/{token}`). When Cloudinary env vars are set on the server, uploads are stored on Cloudinary (same formats as [urre/kap-cloudinary](https://github.com/urre/kap-cloudinary)) while share links stay on your Reave domain.

## Server setup (Reave on Railway)

1. Generate a long random upload key, e.g. `openssl rand -hex 32`
2. Set on the Reave service:

   ```env
   KAP_UPLOAD_KEY=your-secret-here
   ```

3. **Optional — Cloudinary backend** (recommended for larger recordings):

   ```env
   CLOUDINARY_CLOUD_NAME=your-cloud
   CLOUDINARY_API_KEY=...
   CLOUDINARY_API_SECRET=...
   # CLOUDINARY_KAP_FOLDER=kap
   ```

   Get credentials from [Cloudinary Console](https://console.cloudinary.com/) → Dashboard. Kap never sees these — only the upload key.

4. Deploy. Uploads go to `POST /api/kap/upload`; shares use `GET /r/{token}` (redirects to Cloudinary when configured).

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

- Max file size: 25 MB (Postgres fallback) or 100 MB when Cloudinary is configured
- Supported types: GIF, APNG, MP4, WebM
