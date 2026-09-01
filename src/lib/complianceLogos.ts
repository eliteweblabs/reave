/**
 * Regulatory / accessibility compliance marks for marketing and sales collateral.
 *
 * Drop SVG or PNG files into `public/logos/compliance/` — they appear automatically
 * in GET /api/compliance-logos and any UI that reads this list (site footer today;
 * audit sales-sheet left column later).
 *
 * Filename → label: `ada.svg` → "ADA", `wcag-2-1-aa.svg` → "WCAG 2.1 AA".
 * Optional sidecar `{slug}.json` with `{ "name": "Custom label" }` overrides the label.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { projectRoot } from './projectRoot';

export type ComplianceLogo = {
  slug: string;
  name: string;
  src: string;
  width: number;
  height: number;
};

const IMAGE_EXT = new Set(['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif']);
const PUBLIC_DIR = join(projectRoot(), 'public', 'logos', 'compliance');
const PUBLIC_URL_PREFIX = '/logos/compliance';

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

function isImageFile(name: string): boolean {
  if (name.startsWith('.')) return false;
  return IMAGE_EXT.has(extname(name).toLowerCase());
}

function slugFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim().toLowerCase();
}

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

function readSidecarName(slug: string): string | undefined {
  const path = join(PUBLIC_DIR, `${slug}.json`);
  if (!existsSync(path)) return undefined;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown };
    const name = String(raw.name ?? '').trim();
    return name || undefined;
  } catch {
    return undefined;
  }
}

export function complianceLogosDir(): string {
  return PUBLIC_DIR;
}

/** Lists every image in `public/logos/compliance/`, sorted by slug. */
export function listComplianceLogos(): ComplianceLogo[] {
  if (!existsSync(PUBLIC_DIR)) return [];

  const logos = readdirSync(PUBLIC_DIR)
    .filter(isImageFile)
    .map((filename) => {
      const slug = slugFromFilename(filename);
      if (!slug) return null;
      const name = readSidecarName(slug) ?? complianceNameFromSlug(slug);
      return {
        slug,
        name,
        src: `${PUBLIC_URL_PREFIX}/${encodeURIComponent(filename)}`,
        width: 24,
        height: 24,
      } satisfies ComplianceLogo;
    })
    .filter((logo): logo is ComplianceLogo => Boolean(logo));

  logos.sort((a, b) => a.slug.localeCompare(b.slug, 'en', { sensitivity: 'base' }));
  return logos;
}
