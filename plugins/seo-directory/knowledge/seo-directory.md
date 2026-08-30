# SEO Directory API Kit

Second-tier **citation and directory** work beyond the defaults:

- Google Business Profile
- Apple Business Connect / Apple Maps
- Yelp
- Bing Places

Those four are handled by audits, social URL fields, and (where enabled) online reviews. This kit is the **value-add SEO layer** agencies sell on top.

## Who it is for

- **reave.app** operating one BrightLocal agency account for many clients (no per-site vendor accounts)
- Mostly **local-reach** businesses; some **national / e-commerce** clients (US or worldwide)

## Packages (one module, two modes)

| Mode | Use when | Toolkit focus |
|------|----------|----------------|
| `local` | Storefront or service-area business | One-time Citation Builder campaigns; per-client directory checklist; NAP consistency via BrightLocal |
| `national_ecommerce` | Online sales, no useful local pack | Merchant feeds, niche/marketplace directories, reputation platforms (Trustpilot / G2 / etc.) — checklist-driven, not forced through local aggregators |

Do **not** force national clients through local citation aggregators.

## Why one vendor (BrightLocal)

BrightLocal, Synup, Advice Local, and Whitespark largely feed the **same aggregator backbone** (Data Axle, Foursquare, Localeze). Submitting the same NAP through multiple of those platforms is wasted spend and risks duplicate / conflicting listings.

Pick **one**. reave.app uses **BrightLocal** because:

- Citation Builder matches **one-time ownership** campaigns (credits per submission; listings are not a pure “rent to stay live” product the way some sync APIs are)
- Documented **Locations + Citation Building APIs** for an agency multi-client account
- Strong fit for configurable checklists + campaign tracking inside Reave

## Agency account model

- Credentials: `BRIGHTLOCAL_API_KEY` on the Reave service only
- Clients never get their own BrightLocal login for this kit
- Each client/location maps to a BrightLocal Location + optional Citation Builder campaign

## Per-client directory checklist

v1 stores a **configurable checklist per client** (directories / targets selected for that engagement). Defaults can seed suggestions by mode (`local` vs `national_ecommerce`); operators edit the list. Campaigns and status track against that checklist — not a global “submit to every publisher” blast.

## Agent tools

- `seo_directory_status` — wiring, modes, and whether the agency API key is present

Further tools (create location, order citations, campaign status, checklist CRUD) land as the BrightLocal API surface is wired.

## Related modules

- `site_audits` — discovers presence; does not push citations
- `online_reviews` — reviews triage (Google™, Apple Maps, Yelp, Facebook, Tripadvisor, Trustpilot, Glassdoor)
- `analytic_audit` — Search Console / analytics / IndexNow

When writing audits or proposals, treat Maps & Directories **defaults** separately from **SEO Directory API Kit** second-tier work.
