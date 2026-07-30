# Inquiry Website Audit — Quick (Street) Playbook

Use this playbook for **fast prospect audits** — e.g. Siri **"audit"** / **"create proposal"** when you need results ASAP on the street. Skips slow browser automation and link crawls.

**Quality bar:** Still tool-backed and substantive (~1,200+ characters). Not a 3-bullet stub — but optimized for speed over exhaustive UX crawl.

## When this applies

- Siri shortcut `audit` or `create_proposal` (quick tier)
- User wants a fast site + online presence snapshot to send while still with the prospect
- Time budget: Lighthouse + parallel DNS/SSL/HTML/search — **no Playwright, no link crawl**

## Never do this

- Do **not** call `playwright_audit` or `check_links` in the quick tier — those belong in the full audit
- Do **not** skip `lighthouse_audit`, `ssl_check`, `dns_check`, or `brave_search` — they are the core of the quick audit
- Do **not** guess Lighthouse scores — run `lighthouse_audit` or explain why it failed
- Do **not** use `create_work` for personal to-dos (use todo tools)

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
| `lighthouse_audit` | Performance, accessibility, SEO, best-practices scores (mobile + desktop when `strategy: both`) |
| `ssl_check` | Certificate expiry, TLS, security headers |
| `dns_check` | A/AAAA, MX, SPF, DKIM, DMARC, WHOIS |
| `brave_search` | Google Business Profile, Yelp, reviews/reputation, social handles, hours conflicts |

**Do not run in quick tier:** `playwright_audit`, `check_links`, `detect_tech_stack` (save for full audit).

**Password-protected sites:** Still run `ssl_check`, `dns_check`, and `fetch_url`. Note that Lighthouse scores are N/A until launch.

**If `lighthouse_audit` fails:** Say so in Performance and rely on `fetch_url` — do not invent scores.

### 4. Create or update the project

```
create_work  OR  update_work
  title:     "Website Redesign — {Business Name}"
  status:    inquiry
  contact_uid: <confirmed uid>
  body:      <markdown audit — see template below>
```

### 5. Link and summarize

- End your final reply with a line formatted exactly like `Project: <slug>` followed by 2-3 sentences summarizing the top findings and recommended next step.

## Required `body` structure (markdown)

Same section order as the full audit, but **omit Broken Links** (or note "Not crawled — quick audit tier") and **omit UX/UI Playwright findings**:

```markdown
## Website & Online Presence Audit — {Month Year}

**Current Site:** {domain} ({platform})
**Location:** {street, city, state zip}
**Contact:** {owner, email, phone if known}
**Audit tier:** Quick (street)

---

### Website Performance
- {lighthouse mobile/desktop scores OR "N/A — password-protected / API unavailable"}

### SEO
- Meta description, page title, local keyword gaps

### Accessibility
- {Scores or issues from lighthouse}

### SSL & Security
- SSL validity, expiry, missing headers

### Content Issues
- {Empty pages, outdated copy, placeholder pages from fetch_url}

### DNS & Email
- {A records, MX, SPF/DKIM/DMARC from dns_check}

### Online Presence
- {Google Business Profile, Yelp, reviews/reputation, social — from brave_search}

---

## Action Items
- [ ] Reach out to {contact} about {primary opportunity}
- [ ] {Specific fix 1}
- [ ] {Specific fix 2}
```

**Minimum length:** ~1,200+ characters when the site is publicly crawlable.

## Full audit follow-up

If the user later runs Siri **"full audit"** on the same business, read `inquiry-website-audit` and **update_work** on the existing project with Playwright UX findings, broken links, and tech stack — do not create a duplicate project.
