# Audit sales sheet — back (Figma + cascade)

Print spec for the **back** of the `/admin/sales-sheet` leave-behind, plus the ranked exhibit list.

Code source of truth for ranks and copy: `src/lib/salesSheetCascade.ts`.
Front template: `src/documents/audit-onepager-landscape.md` (US Letter landscape).

The back is not 40 findings. It is **the first three cascade hits**, each as a column with a visual.

---

## Print size

| | |
|---|---|
| Paper | US Letter landscape |
| Live area | **11 × 8.5 in** (same as the front) |
| Office duplex | 0.5 in safe margin, no bleed |
| Shop print | Optional 11.25 × 8.75 in frame (⅛ in bleed), live art centered |
| Duplex | **Short-edge bind** so the back is right-side up when you flip landscape |

Do not use the admin dark theme on paper. Near-black type, one accent, lots of white.

---

## Figma walkthrough

### 1. New file, print frame

1. Figma → **New design file**. Name it `Audit sales sheet — back`.
2. **F** (Frame). Set units to inches (or type `11in` / `8.5in`).
3. Size: **W 11** × **H 8.5**. Name the frame `Back — Letter landscape`.
4. Fill: white (`#FFFFFF`).
5. Office print: skip bleed, use a **0.5 in** safe margin. Shop print: add a second frame at **11.25 × 8.75** and keep live art on the 11×8.5 centered inside it.

### 2. Guides that match the front

The live sheet is header / three columns / footer. Copy that skeleton.

1. **Layout grid** on the frame: **3 columns**, gutter **0.25 in**, margin **0.5 in**.
2. **Rulers** (Shift+R). Horizontal guides at:
   - **0.5 in** — top of header
   - **1.15 in** — bottom of header / top of body
   - **7.85 in** — top of footer
   - **8.0 in** — footer baseline
3. Duplicate the frame as `Front — reference`. Drop a screenshot of `/admin/sales-sheet` so flip-alignment is obvious (logo left, QR right, footer line).

### 3. Shared chrome (same both sides)

Build as **components**:

- **Header** — logo left, title “Website Audit” center, QR right (same 160px QR as the front).
- **Footer** — 9–10pt: prepared for, company, date, “Page 2 of 2”.

Place header and footer on the back. Lock them. Keep the QR on the **front** so they can scan without flipping.

### 4. Three exhibit columns

Each cascade hit is one column. Stack, top to bottom:

1. **Kicker** — 10pt, uppercase, tracked: `01  SSL` / `02  GOOGLE PLACES` / `03  SEARCH`
2. **Problem** — 14–16pt, 2 lines max (cascade `problem`)
3. **Exhibit** — the `sheet` visual below
4. **Next step** — 11pt, one sentence (cascade `solution`)

### 5. Two exhibit components (reuse)

**A. Browser chrome** — SSL, down, expired cert, malware, HTTP still live

1. Rectangle ~**3.1 × 2.4 in**, 8px corner.
2. Top bar 28px: three dots, address field.
3. Address field: audit URL plus warning chip (`Not Secure` / `Expired` / `Deceptive site`).
4. Body: warning page or a faded site screenshot. Swap the URL per client.

**B. iPhone** — Places, Apple Maps, reviews, mobile, search

1. Outer rounded rect **2.15 × 4.4 in**.
2. Notch or Dynamic Island at top.
3. Screen fill off-white.
4. Search pill with `{Business name}` and optional city.
5. Banner (e.g. “No Google listing”).
6. Three competitor / result rows.

Make **B** a component with text properties: Search, Banner, Row 1–3.

### 6. A real client

1. Duplicate `Back` → `Back — {Client}`.
2. Take the three hits from `/admin/sales-sheet`.
3. Swap each column’s kicker / problem / exhibit / next step.
4. Export **PDF** (or PNG at **2x**) from the 11×8.5 frame.

Do not design 40 unique full-page backs. One back template + two exhibit types. The cascade only picks which three slots to fill.

---

## Cascade of terribleness (what the back can show)

Walk rank 1 → N. First three hits become the three columns.

| Rank | Finding | Sheet (what to draw) |
| ---: | --- | --- |
| 1 | SSL | Browser chrome on the audit URL with the Not Secure / “Your connection is not private” warning — padlock crossed out, HTTP, no lock. |
| 2 | Site Down | The audit URL failing to load: timeout, connection refused, or 5xx. |
| 3 | Domain | WHOIS / registrar card: expired or NXDOMAIN. |
| 4 | Malware | Safe Browsing / “Deceptive site” interstitial on the audit URL. |
| 5 | Google Places | Generate an iPhone with a Google search result page from the URL provided from the audit with the business’s name in the search bar and no result showing, and the competition showing. |
| 6 | SSL Expired | Expired-certificate warning plus the cert dates (valid-to in the past). |
| 7 | Bad Certificate | Mismatch / not-trusted warning (self-signed or wrong name). |
| 8 | Parked / Hijacked | Live screenshot: parking page, “for sale,” or coming-soon. |
| 9 | Blacklist | Spamhaus (or similar) hit for the domain or IP. |
| 10 | Unclaimed Listing | iPhone Google listing with “Own this business?” |
| 11 | NAP Mismatch | Side-by-side name / address / phone: site vs Google vs another listing. |
| 12 | Apple Maps | iPhone Maps search, no pin for them, competitors showing. |
| 13 | No Reviews | Listing card with a blank or near-zero review count. |
| 14 | Poor Reviews | Live star rating plus two or three of the worst recent reviews. |
| 15 | Directories | Grid of Google / Apple / Yelp / Bing: claimed vs empty. |
| 16 | Wrong Hours | Google hours next to the real hours (or “Closed” when they are open). |
| 17 | Duplicate Listings | Two Google results for the same business, or a suspended listing. |
| 18 | Not Public | Password wall, coming-soon, or staging page. |
| 19 | Mobile | iPhone crop of the audit URL at 375px: overflow or untappable UI. |
| 20 | Site Speed | Phone vs desktop Lighthouse pair with LCP called out. |
| 21 | No Contact Path | Homepage crop with no phone, form, or book button. |
| 22 | Broken Form | The form plus the failed submit. |
| 23 | Broken Booking | Book-now widget in a failed/empty state. |
| 24 | No Offer | Hero crop: no service line, no single CTA. |
| 25 | Broken Links | One 404 or a short list of dead nav URLs. |
| 26 | Accessibility | Phone crop of the contrast / tap-target fail. |
| 27 | Search | iPhone Google results for service + city: they are not on page one, competitors are. |
| 28 | Blocked from Google | The robots.txt or noindex line that blocks crawlers. |
| 29 | HTTP Still Live | `http://` still loading next to `https://` — two address bars. |
| 30 | Mixed Content | HTTPS padlock-with-warning plus one `http://` asset. |
| 31 | No Tracking | “No analytics / no conversion events” card. |
| 32 | No Sitemap | `/sitemap.xml` 404 or the inventory “missing” line. |
| 33 | Share Cards | iMessage preview of the URL with a blank or random image. |
| 34 | Rich Results | A plain Google result vs what a LocalBusiness pack looks like. |
| 35 | Email Auth | Three-row SPF / DKIM / DMARC card (fail or missing). |
| 36 | Thin Content | Placeholder, lorem, or stale page crop. |
| 37 | No Favicon | Tab strip with the generic globe instead of the brand mark. |
| 38 | Social | Instagram/Facebook (or the missing-profile search) next to the site. |
| 39 | Hosting | Speed score plus the host name (shared / GoDaddy / Bluehost). |
| 40 | Security Headers | Missing HSTS / CSP / X-Frame-Options list — padlock is fine, headers are not. |

Only **Google Places** is drawn in code today (the phone mock on the front). The other `sheet` lines are the spec for Figma and for later generators.
