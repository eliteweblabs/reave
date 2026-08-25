/**
 * App-wide brand colors from admin Company settings — maps to --brand-* CSS vars.
 */
import { brandFontCssVars, type ResolvedBrandFonts } from './brandFonts';
import {
  buildPortalBrandColors,
  portalBrandCssVars,
  type PortalBrandColors,
} from './portalBrandColors';

export const DEFAULT_SITE_BRAND_PRIMARY = '#ffffff';
export const DEFAULT_SITE_BRAND_SECONDARY = '#a1a1a1';

/** Previous magenta pair — treat as unset so the Vercel defaults win. */
const LEGACY_SITE_BRAND_PRIMARY = '#f472b6';
const LEGACY_SITE_BRAND_SECONDARY = '#c026d3';

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normalizeBrandColorHex(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const m = t.match(HEX_RE);
  if (!m) return null;
  const hex = m[1]!;
  if (hex.length === 3) {
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
  }
  return `#${hex}`.toLowerCase();
}

function effectiveBrandHex(
  raw: string | null | undefined,
  fallback: string,
  legacy: string,
): string {
  const hex = normalizeBrandColorHex(raw);
  if (!hex || hex === legacy) return fallback;
  return hex;
}

export function resolveCompanyBrandColors(
  primaryRaw?: string | null,
  secondaryRaw?: string | null,
): PortalBrandColors {
  const primary = effectiveBrandHex(primaryRaw, DEFAULT_SITE_BRAND_PRIMARY, LEGACY_SITE_BRAND_PRIMARY);
  const secondary = effectiveBrandHex(secondaryRaw, DEFAULT_SITE_BRAND_SECONDARY, LEGACY_SITE_BRAND_SECONDARY);
  return buildPortalBrandColors(primary, secondary) ?? buildPortalBrandColors(DEFAULT_SITE_BRAND_PRIMARY, DEFAULT_SITE_BRAND_SECONDARY)!;
}

export function companyBrandCssVars(primaryRaw?: string | null, secondaryRaw?: string | null): Record<string, string> {
  const colors = resolveCompanyBrandColors(primaryRaw, secondaryRaw);
  const vars = portalBrandCssVars(colors);
  vars['--brand-gradient-shadow'] = 'none';
  vars['--brand-glow-filter'] = 'none';
  vars['--create-fab-bg'] = vars['--brand-gradient']!;
  vars['--create-fab-shadow'] = '0 1px 2px rgba(0, 0, 0, 0.12)';
  return vars;
}

export function companyBrandCssVarsInline(primaryRaw?: string | null, secondaryRaw?: string | null): string {
  return Object.entries(companyBrandCssVars(primaryRaw, secondaryRaw))
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

export function companyHtmlStyleAttr(
  fonts: ResolvedBrandFonts,
  brandPrimary?: string | null,
  brandSecondary?: string | null,
): string {
  const parts = [brandFontCssVars(fonts)];
  const brand = companyBrandCssVarsInline(brandPrimary, brandSecondary);
  if (brand) parts.push(brand);
  return parts.join('; ');
}
