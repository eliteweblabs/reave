# Google Workspace DNS — Agent Playbook

Use when the user asks to **set up Google Workspace, Gmail, or Google mail** on a domain whose DNS is in Cloudflare.

This is a one-turn job. Do not ask whether Workspace is purchased. Do not ask them to paste MX or SPF. Those records are public and identical for every domain.

## Tools

| Tool | When |
|------|------|
| `resolve_contact` / `list_contacts` | Client name → website/domain. Do not ask "what's the domain?" if a contact has it. |
| `cloudflare_dns` `setup_google_workspace` | **Do this first, same turn.** Writes the 5 Google MX records, merges SPF (`include:_spf.google.com`), adds a starter DMARC (`p=none`) if missing, and disables Cloudflare Email Routing if it is holding the MX. |
| `cloudflare_dns` `verify` / `list_records` | Confirm the zone is reachable / inspect what landed |
| `google_workspace_domains` | Is this domain already on the Workspace account? |
| `gmail_dkim` | generate_key → publish_to_cloudflare → enable_dkim (account-specific — never ask the user to copy a DKIM key if this tool exists) |
| `namecom_dns` `get_domain` | Only if Cloudflare verify fails — check whether NS is still at the registrar |

## Required workflow

1. User says "set up Google Workspace / Gmail / Google MX" for a client or domain
2. Resolve the apex domain from the chat or `resolve_contact` (e.g. The Barber's Edge → thebarbersedge.com)
3. **`cloudflare_dns` action `setup_google_workspace`** with that domain — immediately
4. If `google_workspace_domains` / `gmail_dkim` are in this turn's inventory, run them next in the same turn
5. Reply with what you wrote. End. Do not send a Cloudflare dashboard walkthrough.

Optional: pass `verification_txt` on `setup_google_workspace` **if you already have the unique token** (from Google Admin or the user). Do not block MX/SPF on it.

## Standard records (already baked into the tool)

You do not need these pasted. They are here so you never invent them:

| Type | Name | Priority | Value |
|------|------|----------|-------|
| MX | `@` | 1 | `aspmx.l.google.com` |
| MX | `@` | 5 | `alt1.aspmx.l.google.com` |
| MX | `@` | 5 | `alt2.aspmx.l.google.com` |
| MX | `@` | 10 | `alt3.aspmx.l.google.com` |
| MX | `@` | 10 | `alt4.aspmx.l.google.com` |
| TXT | `@` | — | `v=spf1 include:_spf.google.com ~all` (merged into any existing SPF) |
| TXT | `_dmarc` | — | `v=DMARC1; p=none` (only if none exists) |

`setup_google_workspace` removes non-Google MX at the apex by default (that is what the Cloudflare "Gmail" button does). Pass `replace_existing_mx: false` only when they asked to keep another mail host.

## Never do this

- Do **not** ask "is Google Workspace already purchased / set up?"
- Do **not** ask the user to paste MX, SPF, or the Cloudflare Gmail preset
- Do **not** hand them a to-do list ("go to Cloudflare → Email → …") when `setup_google_workspace` can run
- Do **not** stop after listing current records — push the known records in the same turn
- Do **not** wait for a verification TXT or DKIM key before writing MX + SPF
