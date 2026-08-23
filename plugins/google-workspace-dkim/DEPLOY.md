---
feature: google_workspace
defaultStatus: deployed
stage: 3
---

# Google Workspace deployment

Paid add-on on the audit sales sheet. MX/SPF/DMARC land through
`cloudflare_dns` `setup_google_workspace`; DKIM and domain admin use
`gmail_dkim` / `google_workspace_domains`.

## Sibling services

- Cloudflare DNS (`dev_infra` + `CLOUDFLARE_API_TOKEN`) for MX, SPF, and DMARC
- Google OAuth (same Cloud project as Search Console) for Admin domains + DKIM

## Required env vars

- `GOOGLE_CLIENT_ID` — OAuth client (Workspace Admin + Gmail DKIM scopes)
- `GOOGLE_CLIENT_SECRET` — OAuth secret
- `CLOUDFLARE_API_TOKEN` — publish MX/SPF/DKIM TXT (ops / agency install)

## External setup

- Enable `google_workspace` in install config `features[]`
- Connect Google Webmaster / Admin OAuth on the install
- For a client domain: `setup_google_workspace`, then `gmail_dkim`
  generate_key → publish_to_cloudflare → enable_dkim

## Checklist

- [ ] Payment recorded (Modules purchase or invoice) when sold as an add-on
- [ ] Set `google_workspace` in `features[]`
- [ ] Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- [ ] Confirm `cloudflare_dns` can reach the zone
- [ ] Set `moduleStatus.google_workspace` → `deployed`
