/**
 * Guards the dummy-first audit sales sheet filler.
 * Run: npm run check:sales-sheet
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DUMMY_SALES_SHEET,
  fillAuditOnePager,
  parseFilledOnePagerColumns,
  parseSalesSheetOrientation,
  salesSheetInputFromReportCard,
  salesSheetInputFromSearchParams,
  selectTopFindings,
  setFrontmatterTitle,
} from '../src/lib/auditSalesSheet.ts';
import { buildAuditReportCard } from '../src/lib/auditReportCard.ts';

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
  assert.match(columns[0] ?? '', /haleco\.example/);
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
  assert.match(input.findings[0]?.problem ?? '', /LCP|six seconds|Google Business|Open Graph/i);
  assert.ok(input.performance === 'D' || input.performance === 'F');
});

console.log(results.join('\n'));
if (failures) {
  console.error(`\n${failures} sales-sheet check(s) failed`);
  process.exit(1);
}
console.log('\nAll sales-sheet checks passed');
