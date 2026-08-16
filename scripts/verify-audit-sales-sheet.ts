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
  DUMMY_SALES_SHEET,
  fillAuditOnePager,
  injectAuditDisclaimerIntoFooter,
  parseFilledOnePagerColumns,
  renderAuditDisclaimerHtml,
  parseSalesSheetOrientation,
  listAuditCompanies,
  salesSheetAuditUrl,
  salesSheetInputFromReportCard,
  salesSheetInputFromSearchParams,
  selectTopFindings,
  setFrontmatterTitle,
} from '../src/lib/auditSalesSheet.ts';
import { buildAuditReportCard } from '../src/lib/auditReportCard.ts';
import { listBrandLogos } from '../src/lib/brandLogos.ts';
import {
  AUDIT_SERVICES_LEAD,
  appendPrintOnePagerArticle,
  renderAuditServicesArticle,
  salesSheetTiers,
} from '../src/lib/auditSalesPricing.ts';
import { INSTALLATION_TIERS, formatInstallUsd } from '../src/lib/installationTiers.ts';
import {
  AUDIT_INTERNET_PRESENCE_STATEMENT,
  cityStateFromAddress,
  DUMMY_PUBLIC_RECORD,
  injectInternetPresenceFacts,
  publicRecordFromContact,
  publicRecordFromSearchParams,
  renderInternetPresenceHtml,
} from '../src/lib/auditInternetPresence.ts';
import {
  injectAuditQrIntoHeader,
  injectPhoneIntoFirstColumn,
  promotePlacesNotListedFinding,
  renderPlacesPhoneMockHtml,
  renderSalesSheetQrHtml,
} from '../src/lib/salesSheetPlacesView.ts';

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
  const input = salesSheetInputFromReportCard(card, DUMMY_SALES_SHEET.contact);
  assert.equal(input.website, 'haleco.example');
  assert.equal(input.findings.length, 3);
  assert.match(input.findings[0]?.problem ?? '', /Google Business|not listed|Missing from Google/i);
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

await test('phone mock-up shows the miss and competitor names', () => {
  const html = renderPlacesPhoneMockHtml({
    query: 'Hale & Co.',
    near: 'Boston',
    listed: false,
    competitors: [
      { name: 'Harbor Street Partners', rating: 4.8, reviewCount: 126, address: '18 Atlantic Ave' },
    ],
    source: 'dummy',
  });
  assert.match(html, /No Google listing/);
  assert.match(html, /Hale &amp; Co\./);
  assert.match(html, /Harbor Street Partners/);
  assert.match(html, /Nearby results/);
  const injected = injectPhoneIntoFirstColumn(
    '<div class="doc-onepager-cols"><div class="doc-onepager-col"><p>Snapshot</p></div></div>',
    html,
  );
  assert.ok(injected.indexOf('ss-phone') < injected.indexOf('Snapshot'));
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
  const block = renderAuditDisclaimerHtml();
  assert.match(block, /Grading scale/);
  assert.match(block, /Measurement stack/);
  assert.match(block, /independent measurement tools/);
  assert.match(block, /not the subjective opinion/);
  assert.match(block, /Google Lighthouse/);
  assert.match(block, /A 90–100/);
  const injected = injectAuditDisclaimerIntoFooter(
    '<footer class="doc-onepager-footer"><p>Prepared for Hale &amp; Co.</p></footer>',
  );
  assert.ok(injected.indexOf('Prepared for') < injected.indexOf('ss-disclaimer'));
  assert.match(injected, /ss-disclaimer-copy/);
  assert.match(injected, /<\/div><\/footer>/);
});

await test('QR block says View Full Audit and lands in the header mast', () => {
  const qr = renderSalesSheetQrHtml('data:image/png;base64,AAA', 'https://example.com/digital-audit');
  assert.match(qr, /View Full Audit/);
  assert.match(qr, /https:\/\/example.com\/digital-audit/);
  const injected = injectAuditQrIntoHeader(
    '<header><div class="doc-onepager-mast"><h1>Website Audit</h1></div></header>',
    qr,
  );
  assert.ok(injected.indexOf('ss-qr') < injected.indexOf('Website Audit'));
});

await test('audit templates opt into folder-backed client brands, not HTML imgs', () => {
  for (const md of [landscape, portrait]) {
    assert.match(md, /^brands:\s*clients$/m);
    assert.doesNotMatch(md, /<img\b/i);
    assert.doesNotMatch(md, /porsche|red bull|new york times/i);
  }
});

await test('audit templates include the standing internet-presence statement', () => {
  for (const md of [landscape, portrait]) {
    assert.match(md, /^presence:\s*true$/m);
  }
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /not endearing/i);
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /reviews/i);
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /take it down|remove|response/i);
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /city and state/i);
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /years in operation/i);
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /staff/i);
  assert.match(AUDIT_INTERNET_PRESENCE_STATEMENT, /registered on/i);
  const html = renderInternetPresenceHtml();
  assert.match(html, /doc-presence/);
  assert.match(html, /Internet presence/);
  assert.match(html, /not endearing/);
  assert.match(html, /Boston, MA/);
  assert.match(html, /Jordan Hale/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /March 12, 2014/);
});

await test('public-record facts fall back to dummy and parse city/state from an address', () => {
  assert.equal(cityStateFromAddress('18 Atlantic Ave, Boston, MA 02110, USA'), 'Boston, MA');
  const dummy = publicRecordFromContact(DUMMY_SALES_SHEET.contact);
  assert.equal(dummy.cityState, DUMMY_PUBLIC_RECORD.cityState);
  assert.equal(dummy.staff.length, 3);
  const live = publicRecordFromContact({
    uid: 'real-1',
    name: 'Sam Rivera',
    company: 'North Pier Bakery',
  });
  assert.equal(live.owner, 'Sam Rivera');
  assert.match(live.cityState, /Not on the website/);
  assert.equal(live.staff.length, 0);
  const fromPortal = publicRecordFromContact({
    uid: 'real-2',
    name: 'Sam Rivera',
    links: [{ system: 'portal', metadata: { address: '12 Harbor St, Portland, ME 04101' } }],
  });
  assert.equal(fromPortal.cityState, 'Portland, ME');
  const fromQuery = publicRecordFromSearchParams(
    new URLSearchParams({ city: 'Portland', state: 'ME', owner: 'Sam Rivera', staff: 'Ada, Bo, Cy' }),
    { uid: 'real-1', name: 'Sam Rivera' },
  );
  assert.equal(fromQuery.cityState, 'Portland, ME');
  assert.deepEqual(fromQuery.staff, ['Ada', 'Bo', 'Cy']);
  const injected = injectInternetPresenceFacts(
    '<div class="doc-presence"><p>old</p></div>',
    fromQuery,
  );
  assert.match(injected, /Portland, ME/);
  assert.doesNotMatch(injected, />old</);
});

await test('fillAuditOnePager keeps the brands, presence, and services frontmatter flags', () => {
  const filled = fillAuditOnePager(landscape, DUMMY_SALES_SHEET);
  assert.match(filled, /^brands:\s*clients$/m);
  assert.match(filled, /^presence:\s*true$/m);
  assert.match(filled, /^services:\s*true$/m);
  assert.match(filled, /Page 1 of 2/);
});

await test('services page lists installation tiers and upfront prices', () => {
  for (const md of [landscape, portrait]) {
    assert.match(md, /^services:\s*true$/m);
    assert.match(md, /Page 1 of 2/);
  }
  assert.match(AUDIT_SERVICES_LEAD, /Prices are on this page/);
  const names = salesSheetTiers().map((t) => t.name);
  assert.deepEqual(names, ['Core OS', 'Operations', 'Growth', 'Full platform']);
  const html = renderAuditServicesArticle({
    logoHtml: '<span>Logo</span>',
    footerHtml: '<p>Page 2 of 2</p>',
  });
  assert.match(html, /ss-services/);
  assert.match(html, /Core OS/);
  assert.match(html, /Full platform/);
  assert.match(html, /Document signing/);
  assert.match(html, new RegExp(formatInstallUsd(INSTALLATION_TIERS[0]!.month1).replace(/\$/g, '\\$')));
  const two = appendPrintOnePagerArticle(
    '<style></style><div class="doc-onepager-stage"><article class="doc-onepager">p1</article></div>',
    html,
  );
  assert.ok(two.indexOf('p1') < two.indexOf('ss-services'));
  assert.match(two, /Page 2 of 2/);
});

await test('about-page brand names live in site config and the clients folder is scanned', () => {
  const about = JSON.parse(
    readFileSync(join(here, '../config/sites/reave-config.json'), 'utf8'),
  ) as { clientLogos?: Array<{ name?: string }> };
  const aboutNames = (about.clientLogos ?? []).map((l) => String(l.name || ''));
  assert.ok(aboutNames.some((n) => /porsche/i.test(n)), 'about page is missing Porsche');
  assert.ok(aboutNames.some((n) => /montana/i.test(n)), 'about page is missing Montana Cans');
  const folder = listBrandLogos('clients');
  assert.ok(folder.some((l) => /montana/i.test(l.name) && l.src.includes('/logos/clients/')));
});

console.log(results.join('\n'));
if (failures) {
  console.error(`\n${failures} sales-sheet check(s) failed`);
  process.exit(1);
}
console.log('\nAll sales-sheet checks passed');
