/**
 * Entity continuity scoring — unit checks (no network).
 * Run: npm run check:entity-continuity
 */
import assert from 'node:assert/strict';
import {
  addressesMatch,
  compareNapSources,
  normalizePhoneDigits,
  parseJsonLdEntities,
  phonesMatch,
  scoreToGrade,
  summarizeEntityContinuity,
  websitesMatch,
} from '../src/lib/entityContinuity.ts';
import { checksFromSignals } from '../src/lib/salesSheetDirectories.ts';

function test(name: string, fn: () => void | Promise<void>) {
  return (async () => {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (err) {
      console.error(`  FAIL ${name}`);
      throw err;
    }
  })();
}

await test('normalizePhoneDigits strips US country code', () => {
  assert.equal(normalizePhoneDigits('(413) 555-1212'), '4135551212');
  assert.equal(normalizePhoneDigits('+1 413-555-1212'), '4135551212');
});

await test('phonesMatch compares last 10 digits', () => {
  assert.ok(phonesMatch('413-555-1212', '1 (413) 555-1212'));
  assert.ok(!phonesMatch('413-555-1212', '413-555-9999'));
});

await test('addressesMatch normalizes street suffixes', () => {
  assert.ok(
    addressesMatch('123 Main Street, Longmeadow, MA 01106', '123 Main St, Longmeadow, MA 01106'),
  );
});

await test('websitesMatch ignores www', () => {
  assert.ok(websitesMatch('https://www.pawscalls.com', 'https://pawscalls.com/about'));
  assert.ok(!websitesMatch('https://pawscalls.com', 'https://example.com'));
});

await test('parseJsonLdEntities reads LocalBusiness NAP and sameAs', () => {
  const html = `<!doctype html><html><head>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "VeterinaryCare",
      "name": "Paws Calls",
      "telephone": "+1-413-555-0100",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "100 Main St",
        "addressLocality": "Longmeadow",
        "addressRegion": "MA",
        "postalCode": "01106"
      },
      "sameAs": [
        "https://www.linkedin.com/in/kara-ryczek",
        "https://www.facebook.com/pawscalls"
      ]
    }
    </script>
  </head><body></body></html>`;
  const entities = parseJsonLdEntities(html);
  assert.equal(entities.length, 1);
  assert.equal(entities[0]?.name, 'Paws Calls');
  assert.ok(entities[0]?.address?.includes('Longmeadow'));
  assert.equal(entities[0]?.sameAs.length, 2);
});

await test('compareNapSources flags phone mismatch', () => {
  const mismatches = compareNapSources([
    { id: 'contact', label: 'Contact', phone: '413-555-1212' },
    { id: 'gbp', label: 'GBP', phone: '413-555-9999' },
  ]);
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0]?.field, 'phone');
});

await test('compareNapSources accepts fuzzy business names', () => {
  const mismatches = compareNapSources([
    { id: 'contact', label: 'Contact', name: 'Paws Calls' },
    { id: 'gbp', label: 'GBP', name: 'Paws Calls Veterinary Services' },
  ]);
  assert.equal(mismatches.length, 0);
});

await test('scoreToGrade maps thresholds', () => {
  assert.equal(scoreToGrade(92), 'A');
  assert.equal(scoreToGrade(74), 'C');
  assert.equal(scoreToGrade(40), 'F');
});

await test('summarizeEntityContinuity includes overall grade', () => {
  const summary = summarizeEntityContinuity({
    overall: { score: 72, grade: 'C' },
    nap: { score: 80, grade: 'B', summary: 'NAP ok.', details: [] },
    sameAs: {
      score: 50,
      grade: 'F',
      summary: 'Schema weak.',
      details: [],
      declared: [],
      linkedFromSite: [],
      aligned: [],
      missingFromSite: [],
      hasLocalBusinessSchema: false,
    },
    gbpSite: {
      score: 70,
      grade: 'C',
      summary: 'GBP partial.',
      details: [],
      available: true,
      websiteMatch: true,
      nameMatch: true,
      addressMatch: null,
      phoneMatch: null,
    },
    crossLinks: {
      score: 60,
      grade: 'D',
      summary: 'Profiles thin.',
      details: [],
      checks: checksFromSignals({ linked: ['google'], found: ['google', 'linkedin'] }),
    },
  });
  assert.match(summary, /Entity continuity C \(72\/100\)/);
  assert.match(summary, /NAP ok\./);
});

console.log('\nAll entity-continuity checks passed\n');
