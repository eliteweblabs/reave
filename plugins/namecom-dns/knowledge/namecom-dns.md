# Name.com DNS — Agent Playbook

Use when the user asks to **check, point, or edit DNS at Name.com** (registrar + optional hosted zone). This is **not** zone-records-only.

## Tools

| Tool | When |
|------|------|
| `namecom_dns` action `ping` | Credentials valid (env or vault username/token) |
| `namecom_dns` action `list_domains` | What this Name.com account actually owns |
| `namecom_dns` action `get_domain` | **First DNS step** — nameservers, lock, expiry. Tells you whether Name.com is hosting the zone. |
| `namecom_dns` action `list_records` | Zone records (A/CNAME/TXT/MX) **only live** when NS is `ns*.name.com` |
| `namecom_dns` action `upsert_record` | Create or update one zone record |
| `namecom_dns` action `delete_record` | Remove a record by `record_id` from `list_records` |
| `namecom_dns` action `set_nameservers` | Point the domain at Name.com, Cloudflare, or other NS |
| `cloudflare_dns` | Live records when nameservers are Cloudflare |
| `dns_check` | Public resolver view (can lag after NS changes) |

Granular aliases (`namecom_list_records`, `namecom_create_record`, …) still work. Prefer `namecom_dns`.

## Required workflow

1. User mentions Name.com, a domain they registered there, "point DNS", nameservers, or empty records
2. **`namecom_dns` `get_domain`** (or `ping` if you only need creds)
3. Read `namecom_hosted_zone` and `nameservers`
4. If Name.com hosts DNS → `list_records` / `upsert_record` / `delete_record`
5. If NS is Cloudflare (or other) → **do not** treat empty Name.com zone records as "no DNS". Use `cloudflare_dns` for records. Use `set_nameservers` only when they want to move NS.

## Never do this

- Do **not** say the Name.com API "can only do zone records" — `get_domain` and `set_nameservers` are registrar DNS
- Do **not** report "no DNS" from an empty `list_records` without `get_domain`
- Do **not** upsert zone records and call the job done when NS is not `ns*.name.com` — those records are unused
- Do **not** tell the user to log into Name.com for NS or records unless the tool errors

## Common nameservers

- Stay on Name.com: `ns1.name.com, ns2.name.com, ns3.name.com, ns4.name.com`
- Move to Cloudflare: the two NS Cloudflare shows for that zone (from `cloudflare_dns` verify / the dashboard)
