# Cloudflare DNS & SSL — Agent Playbook

Use when the user asks to **check, fix, or audit DNS or SSL in Cloudflare** — including client domains (not just the company / Resend domain).

## Tools

| Tool | When |
|------|------|
| `cloudflare_dns` action `verify` | First step — confirms token + zone exist **before** claiming "wrong account" or "no access" |
| `cloudflare_dns` action `list_records` | Read current SPF, DMARC, MX, A, CNAME in Cloudflare (authoritative when NS is Cloudflare). Output includes **record ids** for delete_record. |
| `cloudflare_dns` action `upsert_record` | Create or update one record (SPF TXT at `@`, DMARC at `_dmarc`, etc.) |
| `cloudflare_dns` action `delete_record` | Remove a record by `record_id` (from list_records) or by `type` + `name` (+ optional `content`) |
| `cloudflare_dns` action `get_ssl_mode` | Read SSL/TLS encryption mode (off, flexible, full, strict) |
| `cloudflare_dns` action `set_ssl_mode` | Change SSL/TLS mode — **fixes Error 525** when origin cert is broken (use `flexible` as stopgap) |
| `dns_check` | Public resolver view — good for propagation checks; **can lag** minutes after NS changes |
| `fetch_url` / `ssl_check` | Confirm the site is down (525) or back up after a fix |
| `sync_resend_dns` | **Resend domains only** — pulls expected records from Resend API. Fails if domain is not in Resend. |
| `run_dev_task` `ping_cloudflare` | Token connectivity only (no zone lookup) |

## Required workflow

1. User mentions Cloudflare, "fix DNS", SPF/DMARC for a client domain, Error 525, or "I just pointed NS to Cloudflare"
2. **`cloudflare_dns` verify** with the apex domain (e.g. `tonybarlettajr.com`)
3. If verify succeeds → **`list_records`** and/or **`get_ssl_mode`** as needed
4. Compare to what the user needs (M365 → `spf.protection.outlook.com`, DMARC at `_dmarc`, etc.)
5. If user approved changes → **`upsert_record`**, **`delete_record`**, or **`set_ssl_mode`** — **in the same turn**, do not hand off to the dashboard unless the tool errors
6. After SSL or DNS changes, **`fetch_url`** the site to confirm it loads

## Error 525 — SSL handshake failed

When `fetch_url` or the browser shows **Cloudflare Error 525**:

1. Call **`get_ssl_mode`** — mode is usually `full` or `strict` while the origin cert is expired/invalid
2. When the user wants it fixed (they always do — they don't want to log into Cloudflare): call **`set_ssl_mode`** with `ssl_mode: flexible` immediately
3. Wait a minute, then **`fetch_url`** again to confirm the site loads
4. Note in the project/audit: flexible is a stopgap; proper fix is a valid origin cert then switch back to `full` or `strict`

## Never do this

- Do **not** say the domain is in another Cloudflare account without calling `cloudflare_dns verify` first
- Do **not** say "tools are Resend-only" — `cloudflare_dns` handles general zones
- Do **not** report nameservers from a single stale `dns_check` when the user says they **just** switched to Cloudflare — re-run `dns_check` and call `cloudflare_dns verify`
- Do **not** tell the user to paste records into the dashboard or change SSL mode manually when `upsert_record` / `set_ssl_mode` can do it — only fall back on tool error + exact error message
- Do **not** create junk TXT records as a workaround for SSL mode — use `set_ssl_mode`

## Common fixes

**Microsoft 365 mail on Cloudflare:**

- SPF (TXT `@`): `v=spf1 include:spf.protection.outlook.com -all`
- DMARC (TXT `_dmarc`): `v=DMARC1; p=none; rua=mailto:owner@domain.com`
- DKIM: user enables in M365 admin → gives two CNAME selectors → upsert each via `cloudflare_dns`

**Multiple TXT records at `@`:** Domains often have several apex TXT records (SPF + domain verification + MS=…). When upserting SPF, the tool finds the existing record whose content starts with `v=spf1` and updates only that one — other TXT records are left alone. If no SPF record exists yet, it adds a new TXT at `@`. Same pattern for DMARC (`v=DMARC1`) at `_dmarc`.

**Resend sending (company domain):**

- Use `sync_resend_dns` — not manual upsert unless sync fails with a specific error

## When verify fails

Report the **exact tool error**. Typical causes:

- `CLOUDFLARE_API_TOKEN` not set on Railway
- Token lacks Zone → DNS → Read/Edit and/or Zone → Zone Settings → Read/Edit on that zone
- Zone truly not in the account the token can see

Only then suggest dashboard access, inviting a member, or a zone-scoped token — not before trying the tool.

## Site audits

For inquiry audits, run **`dns_check`** for the public report (SPF/DMARC/MX/WHOIS) **and** **`cloudflare_dns list_records`** when the user says DNS is managed in Cloudflare or before recommending record changes. If the site is down, **`fetch_url`** first — don't report audit findings from stale data without checking the live URL.
