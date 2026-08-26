# Branding (per install)

Public URLs are always:

- `/branding/logo.png` — wordmark (invoice email, headers)
- `/branding/icon.png` — square mark
- `/branding/logo.svg` / `/branding/icon.svg`

Production serves whatever is in **admin → Company** (Postgres). Email clients need the PNG.

Drop `logo.png`, `icon.png`, `logo.svg`, and `icon.svg` in this folder for a local override. The files are gitignored so each install can keep its own marks.
