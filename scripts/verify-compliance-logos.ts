/**
 * Compliance logo folder scan — drop-in marks under public/logos/compliance/.
 * Run: npm run check:compliance-logos
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  complianceLogosDir,
  complianceNameFromSlug,
  listComplianceLogos,
} from '../src/lib/complianceLogos.ts';

assert.ok(existsSync(complianceLogosDir()), 'public/logos/compliance directory exists');

const logos = listComplianceLogos();
assert.ok(logos.length >= 8, 'expected seeded compliance marks');

const slugs = logos.map((logo) => logo.slug);
assert.equal(new Set(slugs).size, slugs.length, 'compliance slugs must be unique');

for (const logo of logos) {
  assert.match(logo.src, /^\/logos\/compliance\//);
  assert.ok(logo.name.trim(), `${logo.slug} needs a display name`);
}

assert.equal(complianceNameFromSlug('wcag-2-1-aa'), 'WCAG 2.1 AA');
assert.equal(complianceNameFromSlug('pci-dss'), 'PCI DSS');
assert.equal(complianceNameFromSlug('soc-2'), 'SOC 2');
assert.equal(complianceNameFromSlug('section-508'), 'Section 508');

console.log(`compliance logo checks passed (${logos.length} marks)`);
