/**
 * Regulatory / accessibility compliance marks for marketing and sales collateral.
 *
 * **Never hand-draw or AI-generate compliance logos.** Most standards have no
 * Simple Icons entry — render those as text-only badges. Use `simpleIconSlug`
 * only when the slug is the real mark in Simple Icons (confirm at simpleicons.org).
 *
 * `simple-icons` also ships `ada`, but that is the Ada *programming language* —
 * do not use it for Americans with Disabilities Act.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SIMPLE_ICONS_CDN } from './platformStack';
import { projectRoot } from './projectRoot';

export type ComplianceLogo = {
  slug: string;
  name: string;
  /** Verified Simple Icons slug for an official mark — omit for text-only. */
  simpleIconSlug?: string;
};

/** Curated marks shown in the site footer and GET /api/compliance-logos. */
const COMPLIANCE_MARKS: ComplianceLogo[] = [
  { slug: 'ada', name: 'ADA' },
  { slug: 'ccpa', name: 'CCPA' },
  { slug: 'eu', name: 'EU', simpleIconSlug: 'europeanunion' },
  { slug: 'gdpr', name: 'GDPR' },
  { slug: 'hipaa', name: 'HIPAA' },
  { slug: 'pci-dss', name: 'PCI DSS' },
  { slug: 'section-508', name: 'Section 508' },
  { slug: 'soc-2', name: 'SOC 2' },
  { slug: 'wcag-2-1-aa', name: 'WCAG 2.1 AA' },
];

const ACRONYMS = new Set([
  'ada',
  'ccpa',
  'coppa',
  'dss',
  'eu',
  'gdpr',
  'hipaa',
  'iso',
  'pci',
  'soc',
  'wcag',
  'aa',
  'aaa',
]);

function titleCaseWord(word: string): string {
  const lower = word.toLowerCase();
  if (ACRONYMS.has(lower)) return lower.toUpperCase();
  if (/^\d+$/.test(word)) return word;
  if (/^[a-z]\d+$/i.test(word)) return word.toUpperCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Turn `wcag-2-1-aa` into "WCAG 2.1 AA". */
export function complianceNameFromSlug(slug: string): string {
  const parts = slug.split(/[-_]+/).filter(Boolean);
  const words = parts.map(titleCaseWord);
  return words
    .join(' ')
    .replace(/\b(\d+) (\d+) (\d+)\b/g, '$1.$2.$3')
    .replace(/\b(\d+) (\d+)\b/g, '$1.$2')
    .replace(/\bPCI DSS\b/g, 'PCI DSS')
    .replace(/\bSOC (\d)\b/g, 'SOC $1')
    .trim();
}

export function complianceLogoIconSrc(logo: ComplianceLogo): string | undefined {
  if (!logo.simpleIconSlug) return undefined;
  return SIMPLE_ICONS_CDN(logo.simpleIconSlug);
}

/** Simple Icons SVG path for verification scripts. */
export function simpleIconsSvgPath(slug: string): string {
  return join(projectRoot(), 'node_modules', 'simple-icons', 'icons', `${slug}.svg`);
}

export function simpleIconsSlugExists(slug: string): boolean {
  return existsSync(simpleIconsSvgPath(slug));
}

export function listComplianceLogos(): ComplianceLogo[] {
  return COMPLIANCE_MARKS.map((mark) => ({ ...mark }));
}
