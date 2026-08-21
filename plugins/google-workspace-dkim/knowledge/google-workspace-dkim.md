# Google Workspace DKIM — Agent Playbook

Use after mail DNS is on Google (`setup_google_workspace`) or when the user asks to **enable DKIM / stop spoofing** for a Workspace domain.

## Tools

| Tool | When |
|------|------|
| `google_workspace_domains` | List or get a domain (primary vs secondary vs alias). Call this instead of asking the user. |
| `gmail_dkim` `get_status` | Current key + whether signing is on |
| `gmail_dkim` `generate_key` | New 2048-bit selector if none exists |
| `gmail_dkim` `publish_to_cloudflare` | Writes the TXT to Cloudflare — do not ask them to copy it |
| `gmail_dkim` `enable_dkim` | Turn signing on after the TXT is live |
| `cloudflare_dns` `setup_google_workspace` | MX + SPF if those are not on the zone yet |

## Required workflow

1. `google_workspace_domains` list or get — confirm the domain exists and whether it is primary, secondary, or an alias (aliases share the parent DKIM)
2. `gmail_dkim` `generate_key` (or `get_status` if a key is already there)
3. `gmail_dkim` `publish_to_cloudflare`
4. Wait a minute if enable fails, then `gmail_dkim` `enable_dkim`

All four in the same turn when the user asked to finish Workspace mail. Do not paste a DKIM value into chat and ask them to add it.

## Never do this

- Do **not** ask the user whether the domain is primary or secondary — `google_workspace_domains` knows
- Do **not** ask them to paste a DKIM key from Google Admin when `gmail_dkim` is available
- Do **not** skip MX/SPF — if mail is not on Google yet, call `setup_google_workspace` first
