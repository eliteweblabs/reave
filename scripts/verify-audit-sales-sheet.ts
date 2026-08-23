/**
 * Guards the dummy-first audit sales sheet filler.
 * Run: npm run check:sales-sheet
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyPlacesMissForSheet,
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
import { renderSalesSheetBackHtml, SALES_SHEET_BACK_QA, SALES_SHEET_STACK } from '../src/lib/salesSheetBack.ts';
import {
  applyLiveUrlToFindings,
  dropWorkingSiteDownFindings,
  dropWorkingSslFindings,
  httpsAuditCandidates,
  injectAuditHeroIntoHeader,
  renderFindingPhoneHtml,
  renderSalesSheetFrontExhibitsHtml,
  renderSalesSheetHeaderHeroHtml,
  salesSheetExhibitKind,
} from '../src/lib/salesSheetExhibits.ts';
import { auditUrlShotLooksDown, auditUrlShotLooksInsecure } from '../src/lib/salesSheetPlacesShot.ts';

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

await test('dummy fixture has four findings', () => {
  assert.equal(DUMMY_SALES_SHEET.findings.length, 4);
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

await test('selectTopFindings keeps the four weakest ideas', () => {
  const picked = selectTopFindings([
    { id: 'c', categoryLabel: 'SEO', problem: 'Thin titles', solution: 'Rewrite titles', priority: 3 },
    { id: 'a', categoryLabel: 'Speed', problem: 'Slow LCP', solution: 'Compress images', priority: 1 },
    { id: 'd', categoryLabel: 'Social', problem: 'No Instagram', solution: 'Set up a profile', priority: 4 },
    { id: 'b', categoryLabel: 'Maps', problem: 'Missing GBP', solution: 'Claim the listing', priority: 2 },
  ]);
  assert.deepEqual(picked.map((f) => f.id), ['a', 'b', 'c', 'd']);
});

await test('fillAuditOnePager replaces placeholder columns', () => {
  const filled = fillAuditOnePager(landscape, DUMMY_SALES_SHEET);
  const columns = parseFilledOnePagerColumns(filled);
  assert.equal(columns.length, 1);
  assert.doesNotMatch(columns[0] ?? '', /Prepared for|Scanned —|haleco\.example/);
  assert.match(columns[0] ?? '', /Overall — C \(64\)/);
  assert.doesNotMatch(filled, /Next steps/);
  assert.doesNotMatch(filled, /Placeholder finding one/);
  assert.match(filled, /^title: Website Audit$/m);
  assert.match(filled, /orientation: landscape/);
});

await test('portrait template fills the same snapshot slot', () => {
  const filled = fillAuditOnePager(portrait, DUMMY_SALES_SHEET);
  assert.match(filled, /orientation: portrait/);
  assert.match(parseFilledOnePagerColumns(filled)[0] ?? '', /Overall — C \(64\)/);
  assert.doesNotMatch(filled, /Next steps/);
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
  assert.ok(input.findings.length >= 3 && input.findings.length <= 8);
  assert.match(input.findings[0]?.problem ?? '', /Google Business|not listed|Missing from Google|not listed on Google/i);
  assert.ok(input.performance === 'D' || input.performance === 'F');
});

await test('Places miss is pinned as finding 1', () => {
  const next = promotePlacesNotListedFinding(DUMMY_SALES_SHEET.findings, 'Hale & Co.');
  assert.equal(next[0]?.id, 'places-not-listed');
  assert.equal(next.length, 4);
  assert.ok(!next.some((f) => f.id === 'dummy-listings'));
  const applied = applyPlacesMissToSalesSheet(DUMMY_SALES_SHEET, true);
  assert.equal(applied.visibility, 'F');
  assert.equal(applied.findings[0]?.id, 'places-not-listed');
});

await test('dummy sheet keeps four phones when a live Google listing would drop Maps', () => {
  const dropped = applyPlacesMissToSalesSheet(DUMMY_SALES_SHEET, false);
  assert.ok(dropped.findings.length < 4);
  const dummy = applyPlacesMissForSheet(DUMMY_SALES_SHEET, false, { liveAudit: false });
  assert.equal(dummy.findings.length, 4);
  assert.ok(dummy.findings.some((f) => f.id === 'dummy-listings'));
  const live = applyPlacesMissForSheet(DUMMY_SALES_SHEET, false, { liveAudit: true });
  assert.equal(live.findings.length, dropped.findings.length);
  const forced = applyPlacesMissForSheet(DUMMY_SALES_SHEET, false, { liveAudit: false, force: true });
  assert.equal(forced.findings.length, dropped.findings.length);
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
  const gradeOnly = selectCascadeFindings({
    businessName: 'Kowalski Dental',
    body: 'Security headers are missing. Mixed content on two images.',
    securityGrade: 'F',
  });
  assert.notEqual(gradeOnly[0]?.id, 'ssl-missing');
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

await test('static back is gate + builds + cover with curated stack and no client fields', () => {
  const back = renderSalesSheetBackHtml({
    company: { name: 'REAVE', supportEmail: 'hello@reave.example' },
    orientation: 'landscape',
  });
  assert.match(back, /data-ss-page="back"/);
  assert.match(back, /data-ss-col="gate"/);
  assert.match(back, /data-ss-col="welcome"/);
  assert.match(back, /data-ss-col="builds"/);
  assert.match(back, /data-ss-col="cover"/);
  assert.match(back, /data-ss-col="stack"/);
  assert.match(back, /1fr 1fr 1fr/);
  assert.doesNotMatch(back, /REΛVE builds with/);
  assert.match(back, /Managed hosting/);
  assert.match(back, /We host it/);
  assert.match(back, /This is not spam/);
  assert.match(back, /Beverly/);
  assert.match(back, /20 years/);
  assert.match(back, /This is not automated or random/);
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
  assert.ok(back.indexOf('data-ss-col="qa"') < back.indexOf('data-ss-col="builds"'));
  assert.ok(back.indexOf('data-ss-col="stack"') > back.indexOf('data-ss-col="builds"'));
  assert.match(back, /data-ss-col="cover"[\s\S]*class="ss-back-icon"/);
  assert.match(back, /data-ss-col="gate-icon"/);
  assert.match(back, /top: 50%/);
  assert.match(back, /left: 50%/);
  assert.match(back, /translate\(-50%, -50%\)/);
  assert.match(back, /reave-bg-pattern/);
  assert.match(back, /background-size: 28\.6in 22\.1in/);
  assert.match(back, /opacity: 0\.15/);
  assert.match(back, /mask-image: radial-gradient\(ellipse 50% 50% at 50% 50%/);
  assert.match(back, /\.ss-back-col::before/);
  assert.doesNotMatch(back, /\.ss-back-col::after/);
  assert.match(back, /place-items: center/);
  assert.match(back, /clamp\(56px, 12cqh, 96px\)/);
  for (const tech of SALES_SHEET_STACK) {
    assert.match(back, new RegExp(`data-stack="${tech.slug}"`));
  }
  assert.match(back, /justify-content: space-between/);
  assert.match(back, /flex-wrap: nowrap/);
  assert.match(back, /--ss-print-inset: 0\.2in/);
  assert.match(back, /padding: var\(--ss-print-inset-top\) 0 var\(--ss-print-inset\)/);
  assert.match(back, /grid-template-columns: 1fr 1fr 1fr/);
  assert.match(back, /\.ss-back-cols \{[\s\S]*gap: 0;/);
  assert.match(back, /\.ss-back-col \{[\s\S]*padding: 0 var\(--ss-print-inset\)/);
  assert.doesNotMatch(back, /gap: 0 2\.2%/);
  assert.doesNotMatch(back, /padding-left: 2\.2%/);
  assert.equal((back.match(/class="ss-stack-item" data-stack="/g) || []).length, SALES_SHEET_STACK.length);
  assert.match(back, /simple-icons@v16\/icons\/anthropic\.svg/);
  assert.match(back, /simple-icons@v16\/icons\/astro\.svg/);
  assert.doesNotMatch(back, /data-stack="react"/);
  assert.doesNotMatch(back, /data-stack="typescript"/);
  assert.doesNotMatch(back, /data-stack="nodedotjs"/);
  assert.doesNotMatch(back, /data-stack="postgresql"/);
  assert.doesNotMatch(back, /data-stack="pexels"/);
  assert.doesNotMatch(back, /data-stack="uptimerobot"/);
  assert.doesNotMatch(back, /data-stack="playwright"/);
  assert.doesNotMatch(back, /data-stack="telnyx"/);
  assert.doesNotMatch(back, /\/stack\/playwright\.svg/);
  assert.match(back, /\/stack\/cal-com\.png/);
  assert.deepEqual(
    SALES_SHEET_STACK.map((tech) => tech.name),
    [...SALES_SHEET_STACK].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map((tech) => tech.name),
  );
  assert.deepEqual(
    [...back.matchAll(/class="ss-stack-item" data-stack="([^"]+)"/g)].map((match) => match[1]),
    SALES_SHEET_STACK.map((tech) => tech.slug),
  );
  assert.doesNotMatch(back, /Printed two sides/);
  assert.doesNotMatch(back, /Page 2 of 2/);
  assert.doesNotMatch(back, /hello@reave\.example/);
  assert.doesNotMatch(back, /doc-onepager-footer/);
  assert.doesNotMatch(back, /ss-back-builds-with/);
  assert.doesNotMatch(back, /ss-back-tile|ss-back-mark|border-radius: 10px/);
  assert.doesNotMatch(back, /Gmail|HubSpot|Replace the stack|Worked with/);
  assert.doesNotMatch(back, /Jordan Hale|Hale &amp; Co\.|haleco\.example|Prepared for/);
  assert.doesNotMatch(back, /ss-qr|the full audit/);
});

await test('SSL and site-down exhibits look like a real phone warning', () => {
  const ssl = renderFindingPhoneHtml(
    {
      id: 'ssl-missing',
      categoryLabel: 'SSL',
      problem: "Auto Dyne's site shows a Not Secure warning.",
      solution: 'Install SSL',
    },
    { website: 'autodyne.com', businessName: 'Auto Dyne' },
  );
  assert.match(ssl, /data-ss-exhibit="ssl"/);
  assert.match(ssl, /Not Secure/);
  assert.match(ssl, /Your connection is not private/);
  assert.match(ssl, /autodyne\.com/);
  assert.match(ssl, /ss-phone-lock/);
  const down = renderFindingPhoneHtml(
    {
      id: 'site-down',
      categoryLabel: 'Site Down',
      problem: "Auto Dyne's website does not load — the front door is closed.",
      solution: 'Get the host up',
    },
    { website: 'autodyne.com', businessName: 'Auto Dyne' },
  );
  assert.match(down, /data-ss-exhibit="site-down"/);
  assert.match(down, /Safari cannot open the page/);
  assert.match(down, /ERR_CONNECTION_REFUSED/);
  assert.equal(salesSheetExhibitKind({ id: 'ssl-expired', categoryLabel: 'SSL Expired' }), 'ssl');
});

await test('directory exhibit is a 2x3 of color listings and one shared missing gray', () => {
  assert.equal(salesSheetExhibitKind({ id: 'directories', categoryLabel: 'Directories' }), 'directories');
  const finding = {
    id: 'directories',
    categoryLabel: 'Directories',
    problem: 'Directory coverage is thin — Yelp, Bing, or Apple still point nowhere.',
    solution: 'Claim the remaining major directories and keep NAP identical.',
  };
  const dirs = renderFindingPhoneHtml(finding, { website: 'weprintwraps.com' });
  const page = renderSalesSheetFrontExhibitsHtml({
    findings: [finding],
    phones: [dirs],
    snapshot: { overall: 'C', overallScore: 64, performance: 'F', security: 'B', visibility: 'D' },
  });
  assert.match(dirs, /data-ss-exhibit="directories"/);
  assert.match(dirs, /Directory coverage/);
  assert.match(page, /grid-template-columns: 1fr 1fr;/);
  assert.match(page, /grid-template-rows: 1fr 1fr 1fr;/);
  assert.doesNotMatch(page, /grayscale\(1\)/);
  assert.match(page, /background: #d8d8de;/);
  assert.match(dirs, /data-dir="yelp"/);
  assert.match(dirs, /data-dir="bing"/);
  assert.match(dirs, /data-dir="apple"/);
  assert.match(dirs, /data-dir="googlemaps"/);
  assert.match(dirs, /data-dir="facebook"/);
  assert.match(dirs, /data-dir="tripadvisor"/);
  assert.match(dirs, /ss-phone-dir--on/);
  assert.match(dirs, /--dir-bg:#4285F4/);
  assert.match(dirs, /data-dir="yelp"[\s\S]*?viewBox="0 0 21\.2 21\.2"/);
  assert.match(dirs, /data-dir="bing"[\s\S]*?fill-rule="evenodd"/);
  assert.equal((dirs.match(/ss-phone-dir--off/g) || []).length, 5);
  assert.equal((dirs.match(/ss-phone-dir--on/g) || []).length, 1);
  assert.doesNotMatch(dirs, /ss-phone-dir-x|IOS_ICONS\.x/);
});

await test('missing Open Graph exhibit is SMS, Facebook, and Instagram as plain text', () => {
  assert.equal(salesSheetExhibitKind({ id: 'dummy-seo', categoryLabel: 'SEO Fundamentals' }), 'share-cards');
  assert.equal(salesSheetExhibitKind({ id: 'no-og-image', categoryLabel: 'Share Cards' }), 'share-cards');
  const og = renderFindingPhoneHtml(
    {
      id: 'dummy-seo',
      categoryLabel: 'SEO Fundamentals',
      problem: 'Title tags and Open Graph are incomplete, so shares look unfinished.',
      solution: 'Finish titles, meta, and share cards so every link looks like the brand.',
    },
    { website: 'haleco.example', businessName: 'Hale & Co.' },
  );
  assert.match(og, /data-ss-exhibit="share-cards"/);
  assert.match(og, /ss-og-sms/);
  assert.match(og, /iMessage/);
  assert.match(og, /ss-og-fb-word">facebook/);
  assert.match(og, /ss-og-ig/);
  assert.match(og, /Direct/);
  assert.equal((og.match(/https:\/\/haleco\.example/g) || []).length, 3);
  assert.doesNotMatch(og, /ss-phone-icon--alert/);
  assert.doesNotMatch(og, /ss-phone-chrome/);
});

await test('front exhibits are four phones with captions and no next steps', () => {
  const phones = DUMMY_SALES_SHEET.findings.map((finding) =>
    renderFindingPhoneHtml(finding, { website: DUMMY_SALES_SHEET.website, businessName: 'Hale & Co.' }),
  );
  const html = renderSalesSheetFrontExhibitsHtml({
    findings: DUMMY_SALES_SHEET.findings,
    phones,
    snapshot: {
      overall: 'C',
      overallScore: 64,
      performance: 'F',
      security: 'B',
      visibility: 'D',
    },
  });
  assert.equal((html.match(/class="ss-exhibit"/g) || []).length, 4);
  assert.match(html, /repeat\(4,/);
  const two = renderSalesSheetFrontExhibitsHtml({
    findings: DUMMY_SALES_SHEET.findings.slice(0, 2),
    phones: DUMMY_SALES_SHEET.findings.slice(0, 2).map((finding) =>
      renderFindingPhoneHtml(finding, { website: DUMMY_SALES_SHEET.website }),
    ),
    snapshot: {
      overall: 'C',
      overallScore: 64,
      performance: 'F',
      security: 'B',
      visibility: 'D',
    },
  });
  assert.equal((two.match(/class="ss-exhibit"/g) || []).length, 2);
  assert.match(two, /repeat\(4,/);
  assert.match(html, /max-width: none/);
  assert.doesNotMatch(html, /max-width: 700px/);
  assert.match(html, /1 · Site Speed/);
  assert.match(html, /4 · No Offer/);
  assert.match(html, /Overall C \(64\)/);
  assert.doesNotMatch(html, /Next steps/);
  assert.doesNotMatch(html, /Compress images and defer/);
});

await test('a live homepage is not Site Down', () => {
  assert.equal(
    auditUrlShotLooksDown({
      down: false,
      status: 200,
      title: 'Kowalski Dental, PC',
      finalUrl: 'https://kowalskidental.com/',
    }),
    false,
  );
  assert.equal(
    auditUrlShotLooksDown({
      down: false,
      status: null,
      title: 'This site can’t be reached',
      finalUrl: 'chrome-error://chromewebdata/',
    }),
    true,
  );
  const kept = dropWorkingSiteDownFindings([
    {
      id: 'site-down',
      categoryLabel: 'Site Down',
      problem: 'The front door is closed.',
      solution: 'Fix hosting',
    },
    {
      id: 'no-offer',
      categoryLabel: 'No Offer',
      problem: 'No next step.',
      solution: 'Rewrite the hero',
    },
  ]);
  assert.deepEqual(kept.map((f) => f.id), ['no-offer']);
});

await test('clean HTTPS drops the Not Secure graphic; a broken host keeps it', () => {
  assert.deepEqual(httpsAuditCandidates('kowalskidental.com'), [
    'https://kowalskidental.com/',
    'https://www.kowalskidental.com/',
  ]);
  assert.equal(
    auditUrlShotLooksInsecure({
      down: false,
      status: 200,
      title: 'Kowalski Dental, PC',
      finalUrl: 'https://www.kowalskidental.com/',
    }),
    false,
  );
  const sslAndDown = [
    {
      id: 'ssl-missing',
      categoryLabel: 'SSL',
      problem: 'Not Secure warning.',
      solution: 'Install SSL',
    },
    {
      id: 'site-down',
      categoryLabel: 'Site Down',
      problem: 'The front door is closed.',
      solution: 'Fix hosting',
    },
    {
      id: 'no-offer',
      categoryLabel: 'No Offer',
      problem: 'No next step.',
      solution: 'Rewrite the hero',
    },
  ];
  const clean = applyLiveUrlToFindings(sslAndDown, {
    cleanUrls: ['https://www.kowalskidental.com/'],
    insecureUrls: [],
    downUrls: [],
  });
  assert.deepEqual(clean.findings.map((f) => f.id), ['no-offer']);
  assert.equal(dropWorkingSslFindings(sslAndDown).every((f) => f.id !== 'ssl-missing'), true);
  const brokenTwin = applyLiveUrlToFindings(sslAndDown, {
    cleanUrls: ['https://www.example.com/'],
    insecureUrls: ['https://example.com/'],
    downUrls: [],
  });
  assert.ok(brokenTwin.findings.some((f) => f.id === 'ssl-missing'));
  assert.equal(brokenTwin.website, 'example.com');
  assert.ok(!brokenTwin.findings.some((f) => f.id === 'site-down'));
  const sslPhone = renderFindingPhoneHtml(sslAndDown[0]!, {
    website: 'example.com',
    screenSrc: 'data:image/png;base64,AAA',
  });
  assert.match(sslPhone, /Your connection is not private/);
  assert.doesNotMatch(sslPhone, /ss-phone-serp/);
});

await test('header hero is the audit overall block restyled for a white sheet', () => {
  const hero = renderSalesSheetHeaderHeroHtml({
    overall: DUMMY_SALES_SHEET.overall,
    overallScore: DUMMY_SALES_SHEET.overallScore,
    headline: DUMMY_SALES_SHEET.headline,
    heroStats: DUMMY_SALES_SHEET.heroStats,
  });
  assert.match(hero, /ss-hero/);
  assert.match(hero, /Overall grade/);
  assert.match(hero, />C</);
  assert.match(hero, /64/);
  assert.match(hero, /Speed and local listings/);
  assert.match(hero, /Every finding sourced from independent platforms/i);
  assert.match(hero, /\.ss-hero-copy \{[\s\S]*left: 50%/);
  assert.match(hero, /translate\(-50%, -50%\)/);
  assert.match(hero, /\.ss-hero-copy \{[\s\S]*text-align: left/);
  assert.doesNotMatch(hero, /#00e5ff|#0b1220|opd-cyan/);
  const injected = injectAuditHeroIntoHeader(
    '<header class="doc-onepager-header"><div class="doc-onepager-logo">LOGO</div><div class="doc-onepager-mast"><h1>Website Audit</h1></div></header>',
    hero,
  );
  assert.ok(injected.indexOf('ss-hero') < injected.indexOf('doc-onepager-mast'));
  assert.ok(injected.indexOf('doc-onepager-logo') < injected.indexOf('ss-hero'));
});

await test('QR sits in the top-right without caption, title, or date', () => {
  const qr = renderSalesSheetQrHtml('data:image/png;base64,AAA', 'https://example.com/digital-audit');
  assert.doesNotMatch(qr, /View Full Audit/);
  assert.doesNotMatch(qr, /figcaption/);
  assert.match(qr, /https:\/\/example.com\/digital-audit/);
  assert.match(qr, /ss-qr-note/);
  assert.match(qr, /the full audit/);
  assert.match(qr, /right: calc\(100% \+ 4px\)/);
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
