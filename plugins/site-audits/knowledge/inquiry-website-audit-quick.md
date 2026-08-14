# Inquiry Website Audit — Quick (Street) Playbook

Use this playbook for **fast prospect audits** — e.g. Siri **"audit"** / **"create proposal"** when you need results ASAP on the street. Skips slow browser automation and link crawls.

**Quality bar:** Still tool-backed and substantive (~1,200+ characters). Not a 3-bullet stub — but optimized for speed over exhaustive UX crawl.

## When this applies

- Siri shortcut `audit` or `create_proposal` (quick tier)
- User wants a fast website + online presence snapshot to send while still with the prospect
- Time budget: Lighthouse + parallel DNS/SSL/HTML/search — **no Playwright, no link crawl**

## Never do this

- Do **not** call `playwright_audit` or `check_links` in the quick tier — those belong in the full audit
- Do **not** skip `lighthouse_audit`, `ssl_check`, `dns_check`, `seo_inventory`, or `brave_search` — they are the core of the quick audit
- Do **not** guess Lighthouse scores — run `lighthouse_audit` once or write "Scores unavailable"
- Do **not** retry `lighthouse_audit` if it fails — proceed to `update_work` (retries burn the run budget)
- Do **not** use `create_work` for personal to-dos (use todo tools)
- Do **not** write client-facing copy as **"this business"** — use the resolved contact / business name whenever possible (e.g. `Joe's Pizza is missing on Apple Maps`)

## Required workflow (in order)

### 1. Resolve the client

```
resolve_contact  →  create_contact if no match
```

Pass `contact_uid` on `create_work`.

### 2. Resolve the URL

- **Siri quick audit**: the user may only give a freeform business description (name + optional street/town). Use `brave_search` with the full string to find the correct business and website before auditing.
- Normalize: `https://` + apex or `www` — follow redirects (`fetch_url` or `ssl_check` shows final host)
- Note platform: Shopify, Squarespace, WordPress, etc.

### 3. Run quick audit tools

Run these in parallel when possible:

| Tool | Use for |
|------|---------|
| `fetch_url` | Title, meta description, visible text, page structure, password/coming-soon pages |
| `seo_inventory` | **Required** — og:image, Twitter cards, favicon, manifest, robots.txt, sitemap, canonical, meta robots, JSON-LD + Problem → Impact pitches |
| `lighthouse_audit` | Performance scores (mobile + desktop). Quick tier: pass `category: "performance"` only — 2 PSI calls, not 8 |
| `ssl_check` | Certificate expiry, TLS, security headers |
| `dns_check` | A/AAAA, MX, SPF, DKIM, DMARC, WHOIS, **hosting company from IP lookup** |
| `brave_search` | Google Business Profile / Google Places, Apple Business Connect / Apple Maps, Yelp, Bing Places, reviews/reputation, social handles, hours conflicts |

**Do not run in quick tier:** `playwright_audit`, `check_links`, `detect_tech_stack` (save for full audit).

**Password-protected sites:** Still run `ssl_check`, `dns_check`, `seo_inventory`, and `fetch_url`. Note that Lighthouse scores are N/A until launch.

**If `lighthouse_audit` fails:** Call it once only. Write "Scores unavailable — run a fresh audit later" in Performance (and Accessibility/SEO if needed). Use `fetch_url` observations — do not invent scores and do not retry the tool.

### 4. Create or update the project

```
create_work  OR  update_work
  title:     <catchy finding-based headline — see full playbook Title & slug conventions>
  status:    audit
  tags:      siri-audit, quick-audit
  contact_uid: <confirmed uid>
  body:      <markdown audit — see template below>
```

Audits are live projects (not inquiries). Keep `status: audit` — never `inquiry` or `archived`.

### 5. Link and summarize

- End your final reply with a line formatted exactly like `Project: <slug>` followed by 2-3 sentences summarizing the top findings and recommended next step.

## Required `body` structure (markdown)

Same section order as the full audit, but **omit Broken Links** (or note "Not crawled — quick audit tier") and **omit UX/UI Playwright findings**:

```markdown
## Website & Online Presence Audit — {Month Year}

**Current Website:** {domain} ({platform})
**Location:** {street, city, state zip}
**Contact:** {owner, email, phone if known}
**Audit tier:** Quick (street)

---

### Performance
- Performance score: {mobile} / {desktop} (Lighthouse lab) OR "N/A — password-protected / API unavailable"
- Real-user experience (Chrome UX Report): {Good / Needs Improvement / Poor / N/A}
- Prefer field data over lab-mobile. Lab mobile is a stress test (nytimes.com often ~20) — never grade the site as failing from the mobile lab number alone.

### Accessibility
- Accessibility notes from fetch_url / any available score (quick tier may not run full Lighthouse a11y)

### Best Practices
- Best Practices notes if observable (HTTPS, mixed content, console/platform issues) — or "Not scored — quick tier"

### SEO
- SEO inventory grade: {A–F} ({score}/100 from seo_inventory)
- Page title / meta description / og:image / Twitter card / canonical / favicon / manifest
- robots.txt: {present / missing / blocks all}
- XML sitemap: {present / missing}
- Copy 2–4 Problem → Impact pitches from seo_inventory into Opportunities

### SSL & Security
- SSL validity, expiry, missing headers

### Domain & IP Reputation
- Any blacklist / Safe Browsing / reputation signals (or "No reputation flags found")

### Content Issues
- {Empty pages, outdated copy, placeholder pages, unclear offer/CTA from fetch_url}

### Lead Capture
- Contact form / click-to-call / chat present and working? Or missing/broken

### Analytics & Conversion Tracking
- **Client-facing.** Scan `fetch_url` HTML for tracking snippets (`gtag(`, `G-` / `UA-` ids, `GTM-`, `plausible.io`, `fbq(`, Hotjar, Fathom) even though quick tier skips `detect_tech_stack`.
- List what is installed on the website, or write "No analytics or conversion tracking was found on the website."
- Do **not** mention owned property, Search Console / GA4 / Plausible access, or that we don't control the domain.

### Search Rich Results
- JSON-LD types from seo_inventory: {list or "none"}
- LocalBusiness / Organization: {present or missing}

### Mobile Responsiveness
- Layout on phones from fetch_url (quick tier — no Playwright; full audit adds Playwright Chromium checks)

### Broken Links & Crawl Health
- Not crawled — quick audit tier

### DNS & Email
- Domain renewal if known; A/MX records; hosting company from dns_check; SPF/DKIM/DMARC gaps in plain language
- If shared/budget host + lean build + poor Lighthouse, note **server resource issue** under Performance (no separate hosting grade)

### Online Presence
Write one bullet per channel (the client portal rolls Google / Apple / Yelp / Bing into one **Maps & Directories** coverage score — separate bullets keep that score accurate):
- Google Business Profile: {Found / Missing / Incomplete / Not claimed} — {notes}
- Apple Business Connect: {Found / Missing / Not claimed} — {Apple Maps notes}
- Yelp: {Found / Missing / Incomplete} — {notes}
- Bing Places: {Found / Missing / Incomplete} — {notes}
- Reviews: {platform, stars, count} — {notes}
- Social: {Instagram / Facebook / other}

**Google Places API (contact create):** When Places returns no business-name match (`placesListing.status = "not_listed"`), you MUST write:
`Google Business Profile: Missing — {Business Name} is not listed in the Google Places API (no business match found).`
Do not soften or omit this — the client must be 100% aware.

---

## Client-facing voice

In the audit `body` (findings, Opportunities, Action Items), **name the business** whenever you refer to them. Prefer `{Business Name}` over vague stand-ins like "this business", "the company", or "the client". Project **titles** still omit the business name (it already shows as the client line in the project list).

## Opportunities
Write 3–5 **Problem → Solution** pairs in plain language for the client portal
(what’s broken → what fixing it does for {Business Name} — no jargon):
- Problem: {what’s broken} → Solution: {service / fix we can sell}

## Action Items
- [ ] Reach out to {contact} about {primary opportunity}
- [ ] {Specific fix 1}
- [ ] {Specific fix 2}
```

Keep Performance / Accessibility / Best Practices / SEO as **separate** headings (the four Lighthouse categories) — do not collapse them under “Website”.

**Minimum length:** ~1,200+ characters when the website is publicly crawlable.

## Title

The project list shows **title** on line 1 and the **client name** on line 2 — do not repeat the business name in the title. Write a short, catchy headline (5–12 words) from the top finding (e.g. `Antique shop, antique website — not in a good way`). Never use `Website Redesign — {Business Name}`.

## Full audit follow-up

If the user later runs Siri **"full audit"** on the same business, read `inquiry-website-audit` and **update_work** on the existing project with Playwright UX findings, broken links, and tech stack — do not create a duplicate project.

## Completion buttons (admin chat)

When finishing an audit in admin chat, append structured button blocks using URLs from the **update_work** tool result — never guess:

- **Contact profile:** `profile_url` (opens Contacts tab for that contact)
- **Audit on client portal:** `project_portal_url` (opens the **Audit** tab — contact uid in `/c/…`, not the job slug)

Wrong `/c/{job-slug}` or `/c/{business-name}` links 404 — only the contact **uid** works in portal paths.
