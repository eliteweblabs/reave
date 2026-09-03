/**
 * Compliance marks — curated list with verified Simple Icons slugs only.
 * Run: npm run check:compliance-logos
 */
import assert from 'node:assert/strict';
import {
  complianceNameFromSlug,
  listComplianceLogos,
  simpleIconsSlugExists,
} from '../src/lib/complianceLogos.ts';

const logos = listComplianceLogos();
assert.ok(logos.length >= 8, 'expected seeded compliance marks');

const slugs = logos.map((logo) => logo.slug);
assert.equal(new Set(slugs).size, slugs.length, 'compliance slugs must be unique');

for (const logo of logos) {
  assert.ok(logo.name.trim(), `${logo.slug} needs a display name`);
  assert.notEqual(
    logo.simpleIconSlug,
    'ada',
    'simple-icons ada is the programming language — not ADA compliance',
  );
  if (logo.simpleIconSlug) {
    assert.ok(
      simpleIconsSlugExists(logo.simpleIconSlug),
      `simple-icons missing ${logo.simpleIconSlug} for ${logo.slug}`,
    );
  }
}

assert.equal(complianceNameFromSlug('wcag-2-1-aa'), 'WCAG 2.1 AA');
assert.equal(complianceNameFromSlug('pci-dss'), 'PCI DSS');
assert.equal(complianceNameFromSlug('soc-2'), 'SOC 2');
assert.equal(complianceNameFromSlug('section-508'), 'Section 508');

console.log(`compliance logo checks passed (${logos.length} marks)`);
