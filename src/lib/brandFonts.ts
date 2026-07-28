/**
 * Curated Google Fonts for admin Company branding.
 * Stored as stable ids in company_config; resolved to CSS + loader URLs at runtime.
 */

export const DEFAULT_FONT_DISPLAY_ID = 'space-grotesk';
export const DEFAULT_FONT_BODY_ID = 'mozilla-text';

export type BrandFontRole = 'display' | 'body';

export type BrandFontOption = {
  id: string;
  label: string;
  /** Google Fonts `family=` query segment. */
  googleSpec: string;
  family: string;
  roles: BrandFontRole[];
};

export const BRAND_FONT_CATALOG: BrandFontOption[] = [
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    googleSpec: 'Space+Grotesk:wght@400;500;600;700',
    family: 'Space Grotesk',
    roles: ['display', 'body'],
  },
  {
    id: 'outfit',
    label: 'Outfit',
    googleSpec: 'Outfit:wght@400;500;600;700',
    family: 'Outfit',
    roles: ['display', 'body'],
  },
  {
    id: 'sora',
    label: 'Sora',
    googleSpec: 'Sora:wght@400;500;600;700',
    family: 'Sora',
    roles: ['display', 'body'],
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    googleSpec:
      'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400',
    family: 'DM Sans',
    roles: ['display', 'body'],
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    googleSpec: 'Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
    family: 'Plus Jakarta Sans',
    roles: ['display', 'body'],
  },
  {
    id: 'inter',
    label: 'Inter',
    googleSpec:
      'Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400',
    family: 'Inter',
    roles: ['display', 'body'],
  },
  {
    id: 'manrope',
    label: 'Manrope',
    googleSpec: 'Manrope:wght@400;500;600;700',
    family: 'Manrope',
    roles: ['display', 'body'],
  },
  {
    id: 'genos',
    label: 'Genos',
    googleSpec: 'Genos:ital,wght@0,400;0,600;0,700;1,400',
    family: 'Genos',
    roles: ['display'],
  },
  {
    id: 'mozilla-text',
    label: 'Mozilla Text',
    googleSpec: 'Mozilla+Text:ital,wght@0,400;0,500;0,600;1,400',
    family: 'Mozilla Text',
    roles: ['body'],
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    googleSpec: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400',
    family: 'Source Serif 4',
    roles: ['body'],
  },
];

const DISPLAY_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const BODY_FALLBACK = 'Georgia, "Times New Roman", serif';

const catalogById = new Map(BRAND_FONT_CATALOG.map((entry) => [entry.id, entry]));

export function brandFontById(id: string | null | undefined): BrandFontOption | undefined {
  const key = (id ?? '').trim();
  if (!key) return undefined;
  return catalogById.get(key);
}

export function brandFontsForRole(role: BrandFontRole): BrandFontOption[] {
  return BRAND_FONT_CATALOG.filter((entry) => entry.roles.includes(role));
}

export function brandFontCatalogForAdmin(): Array<
  Pick<BrandFontOption, 'id' | 'label' | 'roles' | 'googleSpec' | 'family'>
> {
  return BRAND_FONT_CATALOG.map(({ id, label, roles, googleSpec, family }) => ({
    id,
    label,
    roles,
    googleSpec,
    family,
  }));
}

export function resolveBrandFontId(
  id: string | null | undefined,
  role: BrandFontRole,
): string {
  const entry = brandFontById(id);
  if (entry?.roles.includes(role)) return entry.id;
  return role === 'display' ? DEFAULT_FONT_DISPLAY_ID : DEFAULT_FONT_BODY_ID;
}

export function normalizeBrandFontInput(
  id: string | null | undefined,
  role: BrandFontRole,
): string | null {
  const trimmed = (id ?? '').trim();
  if (!trimmed) return null;
  const entry = brandFontById(trimmed);
  if (!entry?.roles.includes(role)) return null;
  return entry.id;
}

export type ResolvedBrandFonts = {
  fontDisplayId: string;
  fontBodyId: string;
  fontDisplay: string;
  fontBody: string;
  googleFontsHref: string;
};

export function resolveBrandFonts(
  storedDisplay?: string | null,
  storedBody?: string | null,
): ResolvedBrandFonts {
  const fontDisplayId = resolveBrandFontId(storedDisplay, 'display');
  const fontBodyId = resolveBrandFontId(storedBody, 'body');
  const displayEntry = catalogById.get(fontDisplayId)!;
  const bodyEntry = catalogById.get(fontBodyId)!;

  const specs = new Map<string, string>();
  specs.set(displayEntry.family, displayEntry.googleSpec);
  specs.set(bodyEntry.family, bodyEntry.googleSpec);

  const googleFontsHref = `https://fonts.googleapis.com/css2?${[...specs.values()]
    .map((spec) => `family=${spec}`)
    .join('&')}&display=swap`;

  return {
    fontDisplayId,
    fontBodyId,
    fontDisplay: `"${displayEntry.family}", ${DISPLAY_FALLBACK}`,
    fontBody: `"${bodyEntry.family}", ${BODY_FALLBACK}`,
    googleFontsHref,
  };
}
