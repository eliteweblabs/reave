# Inquiry Website Audit — Full Project Playbook

Use this playbook for **comprehensive audits** — admin chat full reviews, Siri **"full audit"**, or when the user explicitly wants Playwright UX, broken-link crawl, and tech stack detection.

For **fast street audits** (Siri **"audit"** / **"create proposal"**), use `inquiry-website-audit-quick` instead — same core checks minus Playwright, link crawl, and tech stack.

**Quality bar:** The Barber's Edge inquiry project (`website-redesign-the-barber-s-edge`) is the reference — ~2,000+ characters with tool-backed findings, not a 3-bullet prospect stub.

## When this applies

- User says: **full audit**, full website review, deep website audit, Playwright UX review
- Siri shortcut `full_audit` or `create_proposal_full`
- Admin chat when the user wants everything — not the quick street tier
- You recovered or summarized prospects from a list — still run tools on each URL before `create_work`

## Never do this

- Do **not** call `create_work` with only address + "password locked" + 3 action items from memory
- Do **not** skip audit tools because the website looks empty or password-protected — document what you *can* verify (DNS, SSL, redirects, platform)
- Do **not** guess Lighthouse scores — run `lighthouse_audit` or omit scores and explain why
- Do **not** use `create_work` for personal to-dos (use todo tools)
- Do **not** write client-facing copy as **"this business"** — it reads informal and generic. Use the resolved contact / business name whenever possible (e.g. `Joe's Pizza is missing on Apple Maps`, not `This business is missing on Apple Maps`).

## Required workflow (in order)

### 1. Resolve the client

```
resolve_contact  →  confirm with user if ambiguous
```

Pass `contact_uid` on `create_work`. If creating from the current chat, `source_chat_id` is set automatically; also call `link_to_work` after create if the thread should stay linked.

### 2. Resolve the URL

- Prefer contact record website/domain
- **Siri "Full Audit"**: the user may only give a freeform business description (name + optional street/town). Use `brave_search` with the full string to find the correct business and website before auditing. If a quick-audit project already exists for this business, **update_work** instead of creating a duplicate.
- Normalize: `https://` + apex or `www` — follow redirects (`fetch_url` or `ssl_check` shows final host)
- Note platform: Shopify, Squarespace, Square Online, WordPress, etc.

### 3. Run audit tools (all that apply)

| Tool | Use for |
|------|---------|
| `fetch_url` | Title, meta description, visible text, page structure, password/coming-soon pages |
| `seo_inventory` | **Required** sales checklist: og:image / Open Graph, Twitter cards, favicon, apple-touch-icon, web manifest, robots.txt, XML sitemap, canonical, meta robots/noindex, JSON-LD types — with Problem → Impact pitches |
| `lighthouse_audit` | Performance, accessibility, SEO, best-practices scores (mobile + desktop when `strategy: both`) |
| `ssl_check` | Certificate expiry, TLS, security headers (CSP, HSTS, X-Frame-Options, etc.) |
| `check_links` | Broken internal links, bad redirects (run on homepage + key subpages if linked) |
| `dns_check` | A/AAAA, MX, SPF, DKIM, DMARC, WHOIS, **hosting company from IP lookup** (public resolvers — can lag after NS changes) |
| `cloudflare_dns` | When DNS is in Cloudflare: verify zone, list records, fix SPF/DMARC; `get_ssl_mode` / `set_ssl_mode` for Error 525 (set `flexible` when origin cert is broken — same turn, no dashboard handoff) |
| `brave_search` | Google Business Profile, Apple Business Connect / Apple Maps, Yelp, reviews/reputation, social handles, hours conflicts, "permanently closed" listings |
| `playwright_audit` | Real-browser UX/UI (Playwright / Chromium): nav menus, JS errors, overflow, tap targets, CTAs, forms, desktop + mobile screenshots |
| `detect_tech_stack` | CMS, frameworks, analytics, hosting, payment processors, chat widgets |
| `gsc_search_analytics` / `gsc_inspect_url` / `gsc_list_sitemaps` | Search Console performance + index status (**full tier**; requires connected Google). Always pass explicit `site_url`. |
| `plausible_stats` or `ga4_stats` | Traffic stats when site_id / property_id is known — never invent numbers |

**Full tier only:** `playwright_audit`, `check_links`, `detect_tech_stack`, and Search/Analytics tools (`analytic_audit` feature) are intentionally omitted from the quick street playbook — run them here.

**Password-protected or pre-launch sites (e.g. Shopify password page):** Still run `ssl_check`, `dns_check`, and `fetch_url` on the password page and any public policy URLs. Note in the audit that public Lighthouse scores are N/A until the store launches.

**If `lighthouse_audit` fails (quota / missing `GOOGLE_PAGESPEED_API_KEY`):** Call it once only. Write "Scores unavailable — run a fresh audit later" in affected sections and rely on `fetch_url` + platform notes — do not invent scores and do not retry the tool.

**If Search/Analytics tools return `ANALYTICS_FAILED`:** Mark `### Search / Analytics` as **Failed** with the reason. Do **not** invent clicks, impressions, or traffic. Do **not** retry. Continue the rest of the audit. That failed block must stay admin-only (portal treats it as unavailable).

### 4. Create or update the project

```
create_work  OR  update_work
  title:     <catchy finding-based headline — see Title & slug conventions>
  status:    inquiry
  contact_uid: <confirmed uid>
  body:      <full markdown audit — see template below>
```

If the project already exists as a stub, use `update_work` with the full body instead of leaving the stub.

### 5. Link and summarize

- Call `link_to_work` if the chat/email should appear on the project page
- Tell the user: project slug, top 3 findings, and next outreach step

## Required `body` structure (markdown)

Mirror this section order. Use `##` for the main heading and `###` for categories. End with checkbox action items.

```markdown
## Full Website & Online Presence Audit — {Month Year}

**Current Website:** {domain} ({platform}, {notes e.g. password-protected})
**Location:** {street, city, state zip}
**Contact:** {owner, email, phone if known}

---

### Performance
- Performance score: {mobile} / {desktop} (Lighthouse) OR "N/A — site password-protected / API unavailable"
- {FCP, LCP, specific issues if from lighthouse}
- {Platform bloat, render-blocking, JS/CSS notes if observable}

### Accessibility
- Accessibility score: {0–100 from lighthouse}
- {Contrast, labels, tap targets, other issues}

### Best Practices
- Best Practices score: {0–100 from lighthouse}
- {Console errors, mixed content, deprecated APIs, HTTPS issues}

### SEO
- SEO score: {0–100 from lighthouse}
- SEO inventory grade: {A–F} ({score}/100 from seo_inventory)
- Page title: {value} — {local keyword gap}
- Meta description: {present/missing/empty}
- Open Graph image (og:image): {present/missing — quote URL or "missing"}
- Twitter/X card: {present/missing}
- Canonical URL: {present/missing}
- Meta robots / noindex: {ok or BLOCKS INDEXING}
- Favicon / apple-touch-icon: {present/missing}
- Web app manifest: {present/missing/invalid}
- robots.txt: {present / missing / blocks all crawlers}
- XML sitemap: {present with URL / missing}
- Copy 2–4 Problem → Impact pitches from seo_inventory into Opportunities when status is missing/warn/error

### UX & UI (Playwright)
- Source: Playwright (headless Chromium) — desktop 1440×900 + mobile 375×812
- {Nav menu, JS console errors, overflow, tap targets, CTA/form issues from playwright_audit}
- {Note if Playwright unavailable in environment}

### Technology Stack
- {CMS, hosting, analytics from detect_tech_stack}
- Prefer `dns_check.hosting.company` when header fingerprints miss the host (common behind Cloudflare)

### SSL & Security
- SSL: {valid, issuer, expiry}
- {Missing headers, mixed content}

### Domain & IP Reputation
- {Safe Browsing / blocklist / IP reputation signals, or "No reputation flags found"}
- IP / ASN org from `dns_check.hosting` when useful for reputation context

### Broken Links & Crawl Health
- {From check_links — or "Homepage only; no crawlable nav" if applicable}

### Content & Messaging
- {Empty pages, outdated copy, hours conflicts, placeholder pages, unclear offer/CTA}

### Lead Capture
- {Contact form / click-to-call / chat — present, broken, or missing}

### Analytics & Conversion Tracking
- {Analytics / tag manager / conversion goals — installed and configured, or untracked}

### Search / Analytics
- Status: {OK | **Failed** — reason from ANALYTICS_FAILED; never invent metrics}
- Search Console: {top queries / impressions / CTR when tools succeed}
- Traffic: {Plausible or GA4 summary when configured for this site_url — else N/A}
- Sitemaps / URL inspection: {notes when tools succeed}
- Bing: skipped (placeholder until API ships)
- IndexNow: only for sites we control — not sales prospects

### Search Rich Results
- JSON-LD types from seo_inventory: {list or "none"}
- LocalBusiness / Organization: {present or missing}
- {Any rich-result gaps worth pitching}

### Mobile Responsiveness
- Source: Playwright (headless Chromium) real-browser checks
- {From Playwright UX — layout, tap targets, overflow on phones}

### Backup & Hosting Reliability
Always write structured hosting lines from `dns_check.hosting` (the client portal grades this section):
- Hosting: {company} ({tier}, confidence {high|medium|low})
- Hosting grade hint: {A|B|C|D} — {rating.note}
- {Backup / uptime / single-hosting risk if observable}

**Rating rules (use these exact phrases when they apply):**
- **Managed WordPress (Flywheel / Kinsta / WP Engine / Pressable)** + clean build + strong Lighthouse → Hosting grade A / hosting score 100. Example: `Flywheel managed WordPress — setup looks solid (hosting score 100).`
- **Shared/budget (GoDaddy / Bluehost / HostGator / Hostinger / SiteGround)** + lean page weight (no huge unused-JS / image bloat) + **poor** Lighthouse performance → call it a **server resource issue**, not a front-end problem. Example: `GoDaddy shared hosting + clean build + slow mobile — likely server resource issue.`
- When `attribute_slow_speed_to_resources` is true, repeat that server-resource note under Performance as well.

### DNS & Email
- Domain renewal window if known; {A records, hosting company from dns_check, MX provider}
- Email deliverability: {SPF/DKIM/DMARC status from dns_check} in plain language
- If Cloudflare-managed: note what cloudflare_dns list_records showed vs public dns_check

### Online Presence
Write one bullet per channel (the client portal rolls Google / Apple / Yelp directories into one **Maps & Directories** coverage score — separate bullets keep that score accurate):
- Google Business Profile: {Found / Missing / Incomplete / Not claimed} — {hours, photos, categories, NAP consistency}
- Apple Business Connect: {Found / Missing / Not claimed} — {Apple Maps listing notes}
- Reviews: {platform, star rating, review count} — {reputation notes}
- Social: {Instagram / Facebook / other handles and activity}
- Listings: {Yelp / Bing Places / other directories}
- {Hours inconsistencies across platforms}

---

## Client-facing voice

In the audit `body` (findings, Opportunities, Action Items), **name the business** whenever you refer to them. Prefer `{Business Name}` over vague stand-ins like "this business", "the company", or "the client". Project **titles** still omit the business name (it already shows as the client line in the project list).

## Opportunities
Write 3–6 **Problem → Solution** pairs in plain language for the client portal
(what’s broken → what fixing it does for {Business Name} — no jargon):
- Problem: {what’s broken for the customer} → Solution: {service / fix we can sell}
- Problem: {e.g. the site feels slow on phones} → Solution: {Performance pass / rebuild}
- Problem: {e.g. {Business Name} is invisible on Apple Maps} → Solution: {Apple Maps listing setup}

## Action Items
- [ ] Reach out to {contact} about {primary opportunity}
- [ ] {Specific fix 1}
- [ ] {Specific fix 2}
- …
```

Keep the four Lighthouse categories as **separate** `###` headings (Performance, Accessibility, Best Practices, SEO) — do not wrap them under a single “Website” section. Include numeric scores when `lighthouse_audit` returns them.

**Minimum length:** Aim for **1,500+ characters** when the website is publicly crawlable. Stubs under ~800 characters mean you skipped tools.

## Title & slug conventions

The project list shows **title** on line 1 and the **client name** on line 2 — do not repeat the business name in the title.

- Title: a short, catchy headline (5–12 words) inspired by the **top audit finding** — witty but professional. Reference the business type or a vivid problem, not the client's name.
  - Good: `Antique shop, antique website — not in a good way`
  - Good: `Great reviews, terrible mobile score`
  - Good: `Password page hiding a Shopify launch`
  - Good: `Yelp says open, site says 404`
  - Bad: `Website Redesign — Joe's Pizza` (redundant with the client name below)
- Slug is auto-generated from title; reuse existing slug on `update_work`

## Example reference

Read the live project for structure and depth:

```
read_work  slug: website-redesign-the-barber-s-edge
```

That audit includes real Lighthouse scores, SSL grade, broken links, DNS gaps, and online presence — match that thoroughness for every inquiry prospect.

## Multi-prospect chats

When the user gives a list of businesses (e.g. local street scan):

1. `resolve_contact` for each business (create contact first if missing)
2. Run the **full tool sequence per URL** — do not batch-create stubs
3. One `create_work` per business with full `body`
4. Link all to the same chat if the conversation covers the whole list

## Completion buttons (admin chat)

When finishing an audit in admin chat, append structured button blocks using URLs from the **update_work** tool result:

- **Client profile:** `profile_url`
- **Audit on client portal:** `project_portal_url` (opens the **Audit** tab)

Never put a job slug or business name in `/c/…` — only the contact **uid** works.

## Related tools

- Work/jobs: `create_work`, `update_work`, `read_work`, `link_to_work`
- Website audits: `fetch_url`, `seo_inventory`, `lighthouse_audit`, `ssl_check`, `check_links`, `dns_check`, `playwright_audit`, `detect_tech_stack`
- Search & analytics (full tier): `gsc_*`, `plausible_stats`, `ga4_stats` — see `analytic-audit`
- Research: `brave_search`, `resolve_contact`
- Quick tier (Siri "audit"): see `inquiry-website-audit-quick`
