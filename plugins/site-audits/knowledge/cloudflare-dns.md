# Cloudflare DNS — Agent Playbook

Use when the user asks to **check, fix, or audit DNS in Cloudflare** — including client domains (not just the company / Resend domain).

## Tools

| Tool | When |
|------|------|
| `cloudflare_dns` action `verify` | First step — confirms token + zone exist **before** claiming "wrong account" or "no access" |
| `cloudflare_dns` action `list_records` | Read current SPF, DMARC, MX, A, CNAME in Cloudflare (authoritative when NS is Cloudflare) |
| `cloudflare_dns` action `upsert_record` | Create or update one record (SPF TXT at `@`, DMARC at `_dmarc`, etc.) |
| `dns_check` | Public resolver view — good for propagation checks; **can lag** minutes after NS changes |
| `sync_resend_dns` | **Resend domains only** — pulls expected records from Resend API. Fails if domain is not in Resend. |
| `run_dev_task` `ping_cloudflare` | Token connectivity only (no zone lookup) |

## Required workflow

1. User mentions Cloudflare, "fix DNS", SPF/DMARC for a client domain, or "I just pointed NS to Cloudflare"
2. **`cloudflare_dns` verify** with the apex domain (e.g. `tonybarlettajr.com`)
3. If verify succeeds → **`list_records`** (optionally filter `type: TXT` for SPF/DMARC)
4. Compare to what the user needs (M365 → `spf.protection.outlook.com`, DMARC at `_dmarc`, etc.)
5. If user approved changes → **`upsert_record`** for each record — **in the same turn**, do not hand off to the dashboard unless the tool errors

## Never do this

- Do **not** say the domain is in another Cloudflare account without calling `cloudflare_dns verify` first
- Do **not** say "tools are Resend-only" — `cloudflare_dns` handles general zones
- Do **not** report nameservers from a single stale `dns_check` when the user says they **just** switched to Cloudflare — re-run `dns_check` and call `cloudflare_dns verify`
- Do **not** tell the user to paste records into the dashboard when `upsert_record` can do it — only fall back on tool error + exact error message

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
- Token lacks Zone → DNS → Read/Edit on that zone
- Zone truly not in the account the token can see

Only then suggest dashboard access, inviting a member, or a zone-scoped token — not before trying the tool.

## Site audits

For inquiry audits, run **`dns_check`** for the public report (SPF/DMARC/MX/WHOIS) **and** **`cloudflare_dns list_records`** when the user says DNS is managed in Cloudflare or before recommending record changes.
