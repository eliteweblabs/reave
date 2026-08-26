# Branding (per install)

Public URLs are always:

- `/branding/logo.png` — wordmark (invoice email, headers)
- `/branding/icon.png` — square mark
- `/branding/logo.svg` / `/branding/icon.svg`

Production serves **admin → Company** (Postgres). Email clients need the PNG.

Drop `logo.png`, `icon.png`, `logo.svg`, and `icon.svg` in this folder for a local override. Files are gitignored so each install keeps its own marks.

This folder is not under `/public`. A `public/branding/` directory would be served as static files and 404 missing names before the routes can rasterize company config.
