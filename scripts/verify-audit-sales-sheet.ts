/**
 * Guards the dummy-first audit sales sheet filler.
 * Run: npm run check:sales-sheet
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPlacesMissToSalesSheet,
  applySalesSheetParamOverrides,
  DUMMY_SALES_SHEET,
  fillAuditOnePager,
  injectAuditDisclaimerIntoFooter,
  parseFilledOnePagerColumns,
  renderAuditDisclaimerHtml,
  parseSalesSheetOrientation,
  salesSheetWantsGoogleShot,
  listAuditCompanies,
  salesSheetAuditUrl,
  salesSheetInputFromReportCard,
  salesSheetInputFromSearchParams,
  selectTopFindings,
  setFrontmatterTitle,
} from '../src/lib/auditSalesSheet.ts';
import { buildAuditReportCard } from '../src/lib/auditReportCard.ts';
import { SALES_SHEET_CASCADE, selectCascadeFindings } from '../src/lib/salesSheetCascade.ts';
import {
  googleMapsSearchUrl,
  googlePlacesSearchUrl,
  injectAuditQrIntoHeader,
  injectPhoneIntoFirstColumn,
  promotePlacesNotListedFinding,
  renderPlacesPhoneMockHtml,
  renderSalesSheetQrHtml,
  shortPlaceFromAddress,
} from '../src/lib/salesSheetPlacesView.ts';
import { salesSheetCompetitorQueries } from '../src/lib/salesSheetPlaces.ts';
import { serpShowsBusiness } from '../src/lib/salesSheetPlacesShot.ts';
import {
  GOOGLE_MOBILE_ABANDON_3S,
  sheetSpeedResearchProblem,
  siteSpeedResearchProblem,
} from '../src/lib/salesSheetResearch.ts';
import { renderSalesSheetBackHtml, SALES_SHEET_BACK_QA } from '../src/lib/salesSheetBack.ts';

const results: string[] = [];
let failures = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failures++;
    results.push(`  FAIL ${name}\n         ${err instanceof Error ? err.message : String(err)}`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const landscape = readFileSync(
  join(here, '../src/documents/audit-onepager-landscape.md'),
  'utf8',
);
const portrait = readFileSync(
  join(here, '../src/documents/audit-onepager-portrait.md'),
  'utf8',
);

await test('dummy fixture has three findings', () => {
  assert.equal(DUMMY_SALES_SHEET.findings.length, 3);
  assert.ok(DUMMY_SALES_SHEET.findings.every((f) => f.problem && f.solution));
});

await test('orientation query defaults to landscape', () => {
  assert.equal(parseSalesSheetOrientation(null), 'landscape');
  assert.equal(parseSalesSheetOrientation('portrait'), 'portrait');
  assert.equal(parseSalesSheetOrientation('LANDSCAPE'), 'landscape');
});

await test('site speed copy uses a footnotable Google bounce stat', () => {
  const inline = siteSpeedResearchProblem();
  assert.match(inline, /53% of mobile visitors leave/);
  assert.match(inline, /3 seconds/);
  assert.match(inline, /Google, 2016/);
  assert.doesNotMatch(inline, /Lab speed/);
  const marked = sheetSpeedResearchProblem(inline);
  assert.equal(marked.citations[0], GOOGLE_MOBILE_ABANDON_3S.id);
  assert.match(marked.problem, /¹/);
  assert.doesNotMatch(marked.problem, /Google, 2016/);
});

await test('live Google shot is on unless google=0', () => {
  assert.equal(salesSheetWantsGoogleShot(null), true);
  assert.equal(salesSheetWantsGoogleShot(''), true);
  assert.equal(salesSheetWantsGoogleShot('1'), true);
  assert.equal(salesSheetWantsGoogleShot('0'), false);
});

await test('competitor search retries a shorter local category', () => {
  const queries = salesSheetCompetitorQueries(
    'Blackstone Land Landscape Supply',
    'Beverly, MA',
    '',
  );
  assert.deepEqual(queries, [
    'Blackstone Land Landscape Supply Beverly, MA',
    'Landscape Supply Beverly, MA',
  ]);
});

await test('query params override dummy company and finding 1', () => {
  const input = salesSheetInputFromSearchParams(
    new URLSearchParams({
      company: 'North Pier Bakery',
      name: 'Sam Rivera',
      site: 'northpier.example',
      overall: 'D',
      score: '41',
      finding1: 'No online ordering on mobile.',
      solution1: 'Add a tap-to-order button on the homepage.',
      label1: 'Lead Capture',
    }),
  );
  assert.equal(input.contact.company, 'North Pier Bakery');
  assert.equal(input.contact.name, 'Sam Rivera');
  assert.equal(input.website, 'northpier.example');
  assert.equal(input.overall, 'D');
  assert.equal(input.overallScore, 41);
  assert.equal(input.findings[0]?.categoryLabel, 'Lead Capture');
  assert.match(input.findings[0]?.problem ?? '', /online ordering/);
  assert.equal(input.findings[1]?.id, DUMMY_SALES_SHEET.findings[1]?.id);
});

await test('query params override a live audit sheet without wiping the rest', () => {
  const base = {
    ...DUMMY_SALES_SHEET,
    website: 'actionpaving.example',
    headline: 'From the live audit',
    overall: 'B' as const,
    overallScore: 81,
  };
  const edited = applySalesSheetParamOverrides(
    base,
    new URLSearchParams({ headline: 'Edited headline', overall: 'A' }),
  );
  assert.equal(edited.headline, 'Edited headline');
  assert.equal(edited.overall, 'A');
  assert.equal(edited.website, 'actionpaving.example');
  assert.equal(edited.overallScore, 81);
  assert.equal(edited.findings[0]?.id, DUMMY_SALES_SHEET.findings[0]?.id);
});

await test('selectTopFindings keeps the three weakest ideas', () => {
  const picked = selectTopFindings([
    { id: 'c', categoryLabel: 'SEO', problem: 'Thin titles', solution: 'Rewrite titles', priority: 3 },
    { id: 'a', categoryLabel: 'Speed', problem: 'Slow LCP', solution: 'Compress images', priority: 1 },
    { id: 'd', categoryLabel: 'Social', problem: 'No Instagram', solution: 'Set up a profile', priority: 4 },
    { id: 'b', categoryLabel: 'Maps', problem: 'Missing GBP', solution: 'Claim the listing', priority: 2 },
  ]);
  assert.deepEqual(picked.map((f) => f.id), ['a', 'b', 'c']);
});

await test('fillAuditOnePager replaces placeholder columns', () => {
  const filled = fillAuditOnePager(landscape, DUMMY_SALES_SHEET);
  const columns = parseFilledOnePagerColumns(filled);
  assert.equal(columns.length, 3);
  assert.doesNotMatch(columns[0] ?? '', /Prepared for|Scanned —|haleco\.example/);
  assert.match(columns[0] ?? '', /Overall — C \(64\)/);
  assert.match(columns[1] ?? '', /Site Speed/);
  assert.match(columns[1] ?? '', /53% of mobile visitors leave/);
  assert.match(columns[1] ?? '', /five seconds/);
  assert.match(columns[2] ?? '', /Compress images/);
  assert.doesNotMatch(filled, /Placeholder finding one/);
  assert.match(filled, /^title: Website Audit$/m);
  assert.match(filled, /orientation: landscape/);
});

await test('portrait template fills the same three columns', () => {
  const filled = fillAuditOnePager(portrait, DUMMY_SALES_SHEET);
  assert.match(filled, /orientation: portrait/);
  assert.match(parseFilledOnePagerColumns(filled)[2] ?? '', /Claim both listings/);
});

await test('setFrontmatterTitle replaces an existing title', () => {
  const next = setFrontmatterTitle('---\ntitle: Old\n---\n\nHi', 'Website Audit');
  assert.match(next, /^title: Website Audit$/m);
  assert.doesNotMatch(next, /Old/);
});

await test('salesSheetInputFromReportCard maps authored opportunities', () => {
  const card = buildAuditReportCard({
    title: 'Hale & Co. audit',
    tags: ['siri-audit', 'quick-audit'],
    source: 'siri_audit',
    clientName: 'Jordan Hale',
    body: `## Website Audit

**Current Website:** haleco.example

### Performance
- Performance score: 28 / 41 (Lighthouse)
- FCP 3.8 s · LCP 6.2 s

### SSL & Website Security
- SSL: valid, Grade B

### SEO
- SEO inventory grade: D (52/100)

### Local Listings
- Google Business Profile: not listed
- Apple Business Connect: not listed

### Opportunities
- Problem: Homepage LCP is over six seconds on a phone → Solution: Compress hero images and defer third-party scripts
- Problem: Missing from Google Business and Apple Maps → Solution: Claim both listings and match NAP
- Problem: Share cards have no Open Graph image → Solution: Add OG tags and a branded 1200×630 image

### Action Items
- [ ] Claim Google Business Profile
- [ ] Compress the homepage hero
`,
  });
  assert.ok(card);
  const input = salesSheetInputFromReportCard(card, DUMMY_SALES_SHEET.contact, {
    body: `## Website Audit
**Current Website:** haleco.example
### Local Listings
- Google Business Profile: not listed
`,
  });
  assert.equal(input.website, 'haleco.example');
  assert.equal(input.findings.length, 3);
  assert.match(input.findings[0]?.problem ?? '', /Google Business|not listed|Missing from Google|not listed on Google/i);
  assert.ok(input.performance === 'D' || input.performance === 'F');
});

await test('Places miss is pinned as finding 1', () => {
  const next = promotePlacesNotListedFinding(DUMMY_SALES_SHEET.findings, 'Hale & Co.');
  assert.equal(next[0]?.id, 'places-not-listed');
  assert.equal(next.length, 3);
  assert.ok(!next.some((f) => f.id === 'dummy-listings'));
  const applied = applyPlacesMissToSalesSheet(DUMMY_SALES_SHEET, true);
  assert.equal(applied.visibility, 'F');
  assert.equal(applied.findings[0]?.id, 'places-not-listed');
});

await test('selectTopFindings boosts a Google Places miss ahead of speed', () => {
  const picked = selectTopFindings([
    { id: 'perf', categoryLabel: 'Site Speed', problem: 'Slow LCP', solution: 'Compress', priority: 1 },
    {
      id: 'maps',
      categoryLabel: 'Maps & Directories',
      problem: 'Missing from Google — local customers cannot find you.',
      solution: 'Claim GBP',
      priority: 3,
    },
  ]);
  assert.equal(picked[0]?.id, 'maps');
});

await test('phone fallback lists live Places neighbors without a fake miss banner', () => {
  const html = renderPlacesPhoneMockHtml({
    query: 'Hale & Co.',
    near: 'Boston',
    listed: false,
    competitors: [
      { name: 'Harbor Street Partners', rating: 4.8, reviewCount: 126, address: '18 Atlantic Ave' },
    ],
    source: 'places',
  });
  assert.doesNotMatch(html, /No Google listing/);
  assert.match(html, /Hale &amp; Co\./);
  assert.match(html, /Harbor Street Partners/);
  assert.match(html, /Nearby results/);
  assert.match(html, /ss-phone-frame/);
  assert.match(html, /\/admin\/iphone17-frame\.png/);
  assert.doesNotMatch(html, /ss-phone-notch/);
  const injected = injectPhoneIntoFirstColumn(
    '<div class="doc-onepager-cols"><div class="doc-onepager-col"><p>Snapshot</p></div></div>',
    html,
  );
  assert.ok(injected.indexOf('ss-phone') < injected.indexOf('Snapshot'));
});

await test('phone fallback does not invent dummy competitors', () => {
  const html = renderPlacesPhoneMockHtml({
    query: 'Blackstone Land Landscape Supply',
    near: 'Beverly, MA',
    listed: false,
    competitors: [],
    source: 'dummy',
  });
  assert.doesNotMatch(html, /Harbor Street Partners/);
  assert.doesNotMatch(html, /No Google listing/);
  assert.match(html, /Live Google results were not captured/);
});

await test('phone mock-up can embed a real Google SERP screenshot', () => {
  const html = renderPlacesPhoneMockHtml(
    {
      query: 'CALA RENEE Salon',
      near: 'Beverly, MA',
      listed: false,
      competitors: [],
      source: 'places',
    },
    { screenSrc: 'data:image/png;base64,AAA' },
  );
  assert.match(html, /ss-phone-serp/);
  assert.match(html, /--ss-island-pad/);
  assert.match(html, /data:image\/png;base64,AAA/);
  assert.match(html, /data-places-serp="google"/);
  assert.doesNotMatch(html, /Nearby results/);
  assert.doesNotMatch(html, /Harbor Street Partners/);
});

await test('google Places search URL uses the Places tab and city', () => {
  const url = googlePlacesSearchUrl('CALA RENEE Salon', 'Beverly, MA');
  assert.match(url, /^https:\/\/www\.google\.com\/search\?/);
  assert.match(url, /udm=1/);
  assert.match(url, /CALA\+RENEE\+Salon/);
  assert.match(url, /Beverly/);
  assert.equal(shortPlaceFromAddress('309 Rantoul St, Beverly, MA 01915'), 'Beverly, MA');
  assert.equal(shortPlaceFromAddress('Beverly, MA 01915'), 'Beverly, MA');
  assert.match(googleMapsSearchUrl('CALA RENEE Salon', 'Beverly, MA'), /google\.com\/maps\/search/);
  assert.equal(
    serpShowsBusiness(
      'CALA RENEE Salon',
      'https://www.google.com/maps/place/Cala+Renee+Salon+LLC',
      'Cala Renee Salon LLC, Beverly - Explore in Google Maps',
    ),
    true,
  );
  assert.equal(
    serpShowsBusiness('CALA RENEE Salon', 'https://www.google.com/maps/search/hair+salon', 'Hair salon - Google Maps'),
    false,
  );
});

await test('salesSheetInputFromReportCard pins Places miss when flag is false', () => {
  const card = buildAuditReportCard({
    title: 'Hale & Co. audit',
    tags: ['siri-audit', 'quick-audit'],
    source: 'siri_audit',
    clientName: 'Jordan Hale',
    googlePlacesListed: false,
    body: `## Website Audit

**Current Website:** haleco.example

### Performance
- Performance score: 80 / 88 (Lighthouse)

### SSL & Website Security
- SSL: valid, Grade A

### SEO
- SEO inventory grade: B (82/100)
`,
  });
  assert.ok(card);
  const input = salesSheetInputFromReportCard(card, DUMMY_SALES_SHEET.contact, {
    googlePlacesListed: false,
  });
  assert.equal(input.findings[0]?.id, 'places-not-listed');
  assert.equal(input.visibility, 'F');
});

await test('sales sheet uses contact website, not company name, and F for Not Secure', () => {
  const card = buildAuditReportCard({
    title: 'Website & Digital Presence Review - CALA RENEE Salon',
    tags: ['siri-audit'],
    source: 'organic',
    clientName: 'CALA RENEE Salon',
    website: 'https://calareneesalon.com',
    body: `## Hi Cala!

**Your website is showing a "Not Secure" warning to customers.**

The fix: We need to update your website's security certificate.
`,
  });
  assert.ok(card);
  assert.equal(card.website, 'calareneesalon.com');
  assert.equal(card.categories.find((c) => c.id === 'security')?.grade, 'F');
  const calaBody = `## Hi Cala!

**Your website is showing a "Not Secure" warning to customers.**

The fix: We need to update your website's security certificate.
`;
  const input = salesSheetInputFromReportCard(
    card,
    {
      ...DUMMY_SALES_SHEET.contact,
      company: 'CALA RENEE Salon',
      links: [
        {
          system: 'portal',
          externalId: 'portal',
          metadata: { website: 'https://calareneesalon.com' },
        },
      ],
    },
    { body: calaBody, googlePlacesListed: false },
  );
  assert.equal(input.website, 'calareneesalon.com');
  assert.equal(input.security, 'F');
  assert.equal(input.findings[0]?.id, 'ssl-missing');
  assert.equal(input.findings[1]?.id, 'places-not-listed');
});

await test('Current Website title is not used as the site URL', () => {
  const card = buildAuditReportCard({
    title: 'Salon audit',
    tags: ['siri-audit'],
    clientName: 'CALA RENEE Salon',
    website: 'https://calareneesalon.com',
    body: `## Website Audit

**Current Website:** CALA RENEE Salon

### SSL & Website Security
- TLS inspection failed: connect ECONNREFUSED
`,
  });
  assert.ok(card);
  assert.equal(card.website, 'calareneesalon.com');
  assert.equal(card.categories.find((c) => c.id === 'security')?.grade, 'F');
});

await test('terribleness cascade is 40 unique ranks and SSL beats Places', () => {
  assert.equal(SALES_SHEET_CASCADE.length, 40);
  const ranks = SALES_SHEET_CASCADE.map((item) => item.rank);
  assert.equal(new Set(ranks).size, 40);
  assert.ok(SALES_SHEET_CASCADE.every((item) => item.sheet.trim().length > 20));
  assert.equal(SALES_SHEET_CASCADE[0]?.id, 'ssl-missing');
  assert.equal(SALES_SHEET_CASCADE[4]?.id, 'places-not-listed');
  assert.match(
    SALES_SHEET_CASCADE[4]?.sheet ?? '',
    /iPhone.*Google search result.*business.s name in the search bar.*no result.*competition/i,
  );
  const hits = selectCascadeFindings({
    businessName: 'Cala',
    body: 'Your website is showing a "Not Secure" warning. Google Business Profile: not listed.',
    googlePlacesListed: false,
    securityGrade: 'F',
  });
  assert.equal(hits[0]?.id, 'ssl-missing');
  assert.equal(hits[1]?.id, 'places-not-listed');
  const down = selectCascadeFindings({
    businessName: 'Hale',
    body: 'The site does not load — connection timed out. Domain expired. NXDOMAIN.',
  });
  assert.equal(down[0]?.id, 'site-down');
  assert.equal(down[1]?.id, 'domain-expired');
});

await test('salesSheetAuditUrl prefers explicit audit, then run, then portal uid', () => {
  const origin = 'https://example.com';
  assert.equal(salesSheetAuditUrl(new URLSearchParams(), origin), 'https://example.com/digital-audit');
  assert.equal(
    salesSheetAuditUrl(new URLSearchParams({ run: 'hale-co-audit' }), origin),
    'https://example.com/digital-audit?run=hale-co-audit',
  );
  assert.equal(
    salesSheetAuditUrl(new URLSearchParams({ uid: 'abc-1', project: 'hale-co-audit' }), origin),
    'https://example.com/c/abc-1?tab=audit&project=hale-co-audit',
  );
  assert.equal(
    salesSheetAuditUrl(new URLSearchParams({ audit: 'https://example.com/c/abc-1?tab=audit' }), origin),
    'https://example.com/c/abc-1?tab=audit',
  );
});

await test('listAuditCompanies is unique by company and skips archived', () => {
  const rows = listAuditCompanies([
    {
      slug: 'old-hale',
      client: 'Hale & Co.',
      contact_name: 'Jordan Hale',
      contact_uid: 'u1',
      status: 'audit',
      source: 'siri_audit',
      tags: ['siri-audit'],
      updated: '2026-01-01T00:00:00.000Z',
    },
    {
      slug: 'new-hale',
      client: 'Hale & Co.',
      contact_name: 'Jordan Hale',
      contact_uid: 'u1',
      status: 'audit',
      source: 'siri_audit',
      tags: ['siri-audit'],
      updated: '2026-08-01T00:00:00.000Z',
    },
    {
      slug: 'pier-bakery',
      client: 'North Pier Bakery',
      contact_name: 'Sam Rivera',
      contact_uid: 'u2',
      status: 'audit',
      tags: ['quick-audit'],
      updated: '2026-07-01T00:00:00.000Z',
    },
    {
      slug: 'done-shop',
      client: 'Closed Shop',
      status: 'archived',
      tags: ['siri-audit'],
      updated: '2026-08-02T00:00:00.000Z',
    },
    {
      slug: 'regular-job',
      client: 'Not An Audit',
      status: 'active',
      tags: [],
      source: 'email',
      updated: '2026-08-03T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(rows.map((r) => r.slug), ['new-hale', 'pier-bakery']);
  assert.equal(rows[0]?.company, 'Hale & Co.');
});

await test('sales sheet footer gets the portal audit disclaimer', () => {
  const block = renderAuditDisclaimerHtml(DUMMY_SALES_SHEET.findings);
  assert.match(block, /Grading scale/);
  assert.match(block, /Measurement stack/);
  assert.match(block, /independent measurement tools/);
  assert.match(block, /not the subjective opinion/);
  assert.match(block, /Google Lighthouse/);
  assert.match(block, /A 90–100/);
  assert.match(block, /Sources/);
  assert.match(block, /Think with Google/);
  assert.match(block, /March 2016/);
  const injected = injectAuditDisclaimerIntoFooter(
    '<footer class="doc-onepager-footer"><p>Prepared for Hale &amp; Co.</p></footer>',
    block,
  );
  assert.ok(injected.indexOf('Prepared for') < injected.indexOf('ss-disclaimer'));
  assert.match(injected, /ss-disclaimer-copy/);
  assert.match(injected, /<\/div><\/footer>/);
});

await test('front footer is page 1 of 2 after fill', () => {
  const filled = fillAuditOnePager(landscape, DUMMY_SALES_SHEET);
  assert.match(filled, /Page 1 of 2/);
  assert.doesNotMatch(filled, /Page 1 of 1/);
});

await test('static back is hosting + cover with stack marks and no client fields', () => {
  const back = renderSalesSheetBackHtml({
    company: { name: 'REAVE', supportEmail: 'hello@reave.example' },
    orientation: 'landscape',
  });
  assert.match(back, /data-ss-page="back"/);
  assert.match(back, /data-ss-col="hosting"/);
  assert.match(back, /data-ss-col="builds"/);
  assert.match(back, /data-ss-col="cover"/);
  assert.match(back, /data-ss-col="stack"/);
  assert.match(back, /1fr 1fr 1fr/);
  assert.match(back, /REΛVE builds with/);
  assert.match(back, /ss-back-builds-with/);
  assert.match(back, /Managed hosting/);
  assert.match(back, /We host it/);
  assert.match(back, /Core OS/);
  assert.match(back, />Growth</);
  assert.match(back, /Railway™/);
  assert.match(back, /50M\+/);
  assert.match(back, /Nearby rate/);
  assert.match(back, /Custom builds/);
  assert.match(back, /Built by operators/);
  assert.match(back, /one login instead of the SaaS pile/);
  assert.match(back, /automating the work/);
  assert.match(back, /hosting I could trust/);
  assert.match(back, /Barber's Edge/);
  assert.match(back, /The Law Office of Barry Levine/);
  assert.match(back, /MDOT\.world/);
  assert.match(back, /Online presence diagnostic/);
  assert.match(back, /independent systems scan/);
  assert.match(back, /data-ss-col="qa"/);
  assert.match(back, /Q&amp;A/);
  assert.match(back, /Worried about working with a small shop\?/);
  assert.match(back, /open source/);
  assert.match(back, /client retains full control of all licensing and products/);
  assert.equal(SALES_SHEET_BACK_QA.length, 1);
  assert.match(back, /reave-bg-pattern/);
  assert.match(back, /opacity: 0\.05/);
  assert.match(back, /data-stack="astro"/);
  assert.match(back, /data-stack="anthropic"/);
  assert.match(back, /data-stack="railway"/);
  assert.match(back, /data-stack="supabase"/);
  assert.match(back, /data-stack="nodedotjs"/);
  assert.match(back, /data-stack="github"/);
  assert.match(back, /data-stack="cloudflare"/);
  assert.match(back, /data-stack="caldotcom"/);
  assert.match(back, /data-stack="plausibleanalytics"/);
  assert.match(back, /flex-wrap: nowrap/);
  assert.match(back, /--ss-print-inset: 0\.2in/);
  assert.match(back, /padding: var\(--ss-print-inset-top\) var\(--ss-print-inset\) var\(--ss-print-inset\)/);
  assert.match(back, /border-top: none/);
  assert.equal((back.match(/data-stack="/g) || []).length, 11);
  assert.doesNotMatch(back, /data-stack="react"/);
  assert.doesNotMatch(back, /data-stack="typescript"/);
  assert.doesNotMatch(back, /data-stack="postgresql"/);
  assert.doesNotMatch(back, /data-stack="telnyx"/);
  assert.doesNotMatch(back, /data-stack="pexels"/);
  assert.doesNotMatch(back, /data-stack="uptimerobot"/);
  assert.doesNotMatch(back, /data-stack="playwright"/);
  assert.doesNotMatch(back, /Playwright™/);
  assert.doesNotMatch(back, /repeat\(10,/);
  assert.match(back, /simple-icons@v16\/icons\/anthropic\.svg/);
  assert.match(back, /simple-icons@v16\/icons\/astro\.svg/);
  assert.match(back, /Page 2 of 2/);
  assert.match(back, /hello@reave\.example/);
  assert.doesNotMatch(back, /ss-back-tile|ss-back-mark|border-radius: 10px/);
  assert.doesNotMatch(back, /Gmail|HubSpot|Replace the stack|Worked with/);
  assert.doesNotMatch(back, /Jordan Hale|Hale &amp; Co\.|haleco\.example|Prepared for/);
  assert.doesNotMatch(back, /ss-qr|the full audit/);
});

await test('QR sits in the top-right without caption, title, or date', () => {
  const qr = renderSalesSheetQrHtml('data:image/png;base64,AAA', 'https://example.com/digital-audit');
  assert.doesNotMatch(qr, /View Full Audit/);
  assert.doesNotMatch(qr, /figcaption/);
  assert.match(qr, /https:\/\/example.com\/digital-audit/);
  assert.match(qr, /ss-qr-note/);
  assert.match(qr, /the full audit/);
  assert.match(qr, /doc-onepager-title/);
  assert.match(qr, /doc-onepager-kicker \{ display: none; \}/);
  assert.match(qr, /position: absolute;/);
  assert.match(qr, /--ss-print-inset: 0\.2in;/);
  assert.match(qr, /--ss-print-inset-top: 0\.25in;/);
  assert.match(qr, /top: var\(--ss-print-inset-top\)/);
  assert.match(qr, /right: var\(--ss-print-inset\)/);
  assert.match(qr, /border-bottom: none/);
  assert.match(qr, /border-top: none/);
  const injected = injectAuditQrIntoHeader(
    '<header><div class="doc-onepager-mast"><h1>Website Audit</h1></div></header>',
    qr,
  );
  assert.ok(injected.indexOf('ss-qr') < injected.indexOf('Website Audit'));
});

console.log(results.join('\n'));
if (failures) {
  console.error(`\n${failures} sales-sheet check(s) failed`);
  process.exit(1);
}
console.log('\nAll sales-sheet checks passed');
