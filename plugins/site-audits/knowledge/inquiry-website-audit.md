# Inquiry Website Audit — Full Project Playbook

Use this playbook when the user asks to **review a client website**, **audit online presence**, **research a local business prospect**, or **create an inquiry project** from that research.

**Quality bar:** The Barber's Edge inquiry project (`website-redesign-the-barber-s-edge`) is the reference — ~2,000+ characters with tool-backed findings, not a 3-bullet prospect stub.

## When this applies

- User says: full website review, site audit, online presence check, prospect research, create inquiry for [business]
- You are filing research from a chat into a **Work** project (status `inquiry`)
- You recovered or summarized prospects from a list — still run tools on each URL before `create_work`

## Never do this

- Do **not** call `create_work` with only address + "password locked" + 3 action items from memory
- Do **not** skip audit tools because the site looks empty or password-protected — document what you *can* verify (DNS, SSL, redirects, platform)
- Do **not** guess Lighthouse scores — run `lighthouse_audit` or omit scores and explain why
- Do **not** use `create_work` for personal to-dos (use todo tools)

## Required workflow (in order)

### 1. Resolve the client

```
resolve_contact  →  confirm with user if ambiguous
```

Pass `contact_uid` on `create_work`. If creating from the current chat, `source_chat_id` is set automatically; also call `link_to_work` after create if the thread should stay linked.

### 2. Resolve the URL

- Prefer contact record website/domain
- Normalize: `https://` + apex or `www` — follow redirects (`fetch_url` or `ssl_check` shows final host)
- Note platform: Shopify, Squarespace, Square Online, WordPress, etc.

### 3. Run audit tools (all that apply)

| Tool | Use for |
|------|---------|
| `fetch_url` | Title, meta description, visible text, page structure, password/coming-soon pages |
| `lighthouse_audit` | Performance, accessibility, SEO, best-practices scores (mobile + desktop when `strategy: both`) |
| `ssl_check` | Certificate expiry, TLS, security headers (CSP, HSTS, X-Frame-Options, etc.) |
| `check_links` | Broken internal links, bad redirects (run on homepage + key subpages if linked) |
| `dns_check` | A/AAAA, MX, SPF, DKIM, DMARC, WHOIS |
| `brave_search` | Google Business Profile, Yelp, social handles, hours conflicts, "permanently closed" listings |

**Password-protected or pre-launch sites (e.g. Shopify password page):** Still run `ssl_check`, `dns_check`, and `fetch_url` on the password page and any public policy URLs. Note in the audit that public Lighthouse scores are N/A until the store launches.

**If `lighthouse_audit` fails (quota / missing `GOOGLE_PAGESPEED_API_KEY`):** Say so in the Performance section and rely on `fetch_url` + platform notes — do not invent scores.

### 4. Create or update the project

```
create_work  OR  update_work
  title:     "Website Redesign — {Business Name}"
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

**Current Site:** {domain} ({platform}, {notes e.g. password-protected})
**Location:** {street, city, state zip}
**Contact:** {owner, email, phone if known}

---

### Website Performance
- {lighthouse mobile/desktop scores OR "N/A — site password-protected / API unavailable"}
- {FCP, LCP, specific issues if from lighthouse}
- {Platform bloat, render-blocking, JS/CSS notes if observable}

### SEO
- Meta description: {present/missing/empty}
- Page title: {value} — {local keyword gap}
- {Structured data, sitemap, indexability}

### Accessibility
- {Scores or issues from lighthouse / manual fetch}

### SSL & Security
- SSL: {valid, issuer, expiry}
- {Missing headers, mixed content}

### Broken Links
- {From check_links — or "Homepage only; no crawlable nav" if applicable}

### Content Issues
- {Empty pages, outdated copy, hours conflicts, placeholder pages}

### DNS & Email
- {A records, host, MX provider}
- {SPF/DKIM/DMARC status from dns_check}

### Online Presence
- {Google Business Profile, Yelp, Instagram, Facebook — from brave_search + fetch}
- {Hours inconsistencies across platforms}

---

## Action Items
- [ ] Reach out to {contact} about {primary opportunity}
- [ ] {Specific fix 1}
- [ ] {Specific fix 2}
- …
```

**Minimum length:** Aim for **1,500+ characters** when the site is publicly crawlable. Stubs under ~800 characters mean you skipped tools.

## Title & slug conventions

- Title: `Website Redesign — {Business Name}` (or user's phrasing)
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

## Related tools

- Work/jobs: `create_work`, `update_work`, `read_work`, `link_to_work`
- Site audits: `fetch_url`, `lighthouse_audit`, `ssl_check`, `check_links`, `dns_check`
- Research: `brave_search`, `resolve_contact`
