/**
 * App-wide brand colors from admin Company settings — maps to --brand-* CSS vars.
 */
import { brandFontCssVars, type ResolvedBrandFonts } from './brandFonts';
import {
  buildPortalBrandColors,
  portalBrandCssVars,
  type PortalBrandColors,
} from './portalBrandColors';

export const DEFAULT_SITE_BRAND_PRIMARY = '#f472b6';
export const DEFAULT_SITE_BRAND_SECONDARY = '#c026d3';
/** Default Home Screen / favicon tile background (matches prior hard-coded tile). */
export const DEFAULT_ICON_BACKGROUND = '#09090b';

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

/** Resolved icon tile background — admin value or default near-black. */
export function resolveIconBackground(raw?: string | null): string {
  return normalizeBrandColorHex(raw) ?? DEFAULT_ICON_BACKGROUND;
}

function effectiveBrandHex(raw: string | null | undefined, fallback: string): string {
  return normalizeBrandColorHex(raw) ?? fallback;
}

export function resolveCompanyBrandColors(
  primaryRaw?: string | null,
  secondaryRaw?: string | null,
): PortalBrandColors {
  const primary = effectiveBrandHex(primaryRaw, DEFAULT_SITE_BRAND_PRIMARY);
  const secondary = effectiveBrandHex(secondaryRaw, DEFAULT_SITE_BRAND_SECONDARY);
  return buildPortalBrandColors(primary, secondary) ?? buildPortalBrandColors(DEFAULT_SITE_BRAND_PRIMARY, DEFAULT_SITE_BRAND_SECONDARY)!;
}

export function companyBrandCssVars(primaryRaw?: string | null, secondaryRaw?: string | null): Record<string, string> {
  const colors = resolveCompanyBrandColors(primaryRaw, secondaryRaw);
  const vars = portalBrandCssVars(colors);
  vars['--brand-gradient-shadow'] =
    `0 2px 16px rgba(${colors.secondaryRgb}, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.35)`;
  vars['--brand-glow-filter'] = 'none';
  vars['--create-fab-bg'] = vars['--brand-gradient']!;
  vars['--create-fab-shadow'] = vars['--brand-gradient-shadow']!;
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
