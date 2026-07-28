/**
 * Curated Google Fonts for admin Company branding.
 * Stored as stable ids in company_config; resolved to CSS + loader URLs at runtime.
 */

export const DEFAULT_FONT_PRIMARY_ID = 'space-grotesk';
export const DEFAULT_FONT_SECONDARY_ID = 'space-grotesk';
export const DEFAULT_FONT_CONTENT_ID = 'mozilla-text';

export type BrandFontRole = 'primary' | 'secondary' | 'content';

export type BrandFontOption = {
  id: string;
  label: string;
  /** Google Fonts `family=` query segment. */
  googleSpec: string;
  family: string;
  roles: BrandFontRole[];
};

const ALL_ROLES: BrandFontRole[] = ['primary', 'secondary', 'content'];

export const BRAND_FONT_CATALOG: BrandFontOption[] = [
  {
    id: 'space-grotesk',
    label: 'Space Grotesk',
    googleSpec: 'Space+Grotesk:wght@400;500;600;700',
    family: 'Space Grotesk',
    roles: ALL_ROLES,
  },
  {
    id: 'outfit',
    label: 'Outfit',
    googleSpec: 'Outfit:wght@400;500;600;700',
    family: 'Outfit',
    roles: ALL_ROLES,
  },
  {
    id: 'sora',
    label: 'Sora',
    googleSpec: 'Sora:wght@400;500;600;700',
    family: 'Sora',
    roles: ALL_ROLES,
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    googleSpec:
      'DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400',
    family: 'DM Sans',
    roles: ALL_ROLES,
  },
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    googleSpec: 'Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400',
    family: 'Plus Jakarta Sans',
    roles: ALL_ROLES,
  },
  {
    id: 'inter',
    label: 'Inter',
    googleSpec:
      'Inter:ital,opsz,wght@0,14..32,400;0,14..32,500;0,14..32,600;0,14..32,700;1,14..32,400',
    family: 'Inter',
    roles: ALL_ROLES,
  },
  {
    id: 'manrope',
    label: 'Manrope',
    googleSpec: 'Manrope:wght@400;500;600;700',
    family: 'Manrope',
    roles: ALL_ROLES,
  },
  {
    id: 'genos',
    label: 'Genos',
    googleSpec: 'Genos:ital,wght@0,400;0,600;0,700;1,400',
    family: 'Genos',
    roles: ['primary', 'secondary'],
  },
  {
    id: 'mozilla-text',
    label: 'Mozilla Text',
    googleSpec: 'Mozilla+Text:ital,wght@0,400;0,500;0,600;1,400',
    family: 'Mozilla Text',
    roles: ALL_ROLES,
  },
  {
    id: 'source-serif-4',
    label: 'Source Serif 4',
    googleSpec: 'Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,500;0,8..60,600;1,8..60,400',
    family: 'Source Serif 4',
    roles: ['content', 'secondary'],
  },
];

const SANS_FALLBACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
const CONTENT_FALLBACK = 'Georgia, "Times New Roman", serif';

const catalogById = new Map(BRAND_FONT_CATALOG.map((entry) => [entry.id, entry]));

const DEFAULTS: Record<BrandFontRole, string> = {
  primary: DEFAULT_FONT_PRIMARY_ID,
  secondary: DEFAULT_FONT_SECONDARY_ID,
  content: DEFAULT_FONT_CONTENT_ID,
};

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
  return DEFAULTS[role];
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

export type StoredBrandFontInput = {
  fontPrimary?: string | null;
  fontSecondary?: string | null;
  fontContent?: string | null;
  /** @deprecated legacy column */
  fontDisplay?: string | null;
  /** @deprecated legacy column */
  fontBody?: string | null;
};

export type ResolvedBrandFonts = {
  fontPrimaryId: string;
  fontSecondaryId: string;
  fontContentId: string;
  fontPrimary: string;
  fontSecondary: string;
  fontContent: string;
  googleFontsHref: string;
};

function fontFamilyCss(entry: BrandFontOption, role: BrandFontRole): string {
  const fallback = role === 'content' ? CONTENT_FALLBACK : SANS_FALLBACK;
  return `"${entry.family}", ${fallback}`;
}

function googleFontsHrefForEntries(entries: BrandFontOption[]): string {
  const specs = new Map<string, string>();
  for (const entry of entries) {
    specs.set(entry.family, entry.googleSpec);
  }
  return `https://fonts.googleapis.com/css2?${[...specs.values()]
    .map((spec) => `family=${spec}`)
    .join('&')}&display=swap`;
}

export function resolveBrandFonts(stored?: StoredBrandFontInput | null): ResolvedBrandFonts {
  const primaryRaw = stored?.fontPrimary ?? stored?.fontDisplay;
  const contentRaw = stored?.fontContent ?? stored?.fontBody;
  const secondaryRaw = stored?.fontSecondary ?? primaryRaw;

  const fontPrimaryId = resolveBrandFontId(primaryRaw, 'primary');
  const fontSecondaryId = resolveBrandFontId(secondaryRaw, 'secondary');
  const fontContentId = resolveBrandFontId(contentRaw, 'content');

  const primaryEntry = catalogById.get(fontPrimaryId)!;
  const secondaryEntry = catalogById.get(fontSecondaryId)!;
  const contentEntry = catalogById.get(fontContentId)!;

  return {
    fontPrimaryId,
    fontSecondaryId,
    fontContentId,
    fontPrimary: fontFamilyCss(primaryEntry, 'primary'),
    fontSecondary: fontFamilyCss(secondaryEntry, 'secondary'),
    fontContent: fontFamilyCss(contentEntry, 'content'),
    googleFontsHref: googleFontsHrefForEntries([primaryEntry, secondaryEntry, contentEntry]),
  };
}

/** Inline style for global `--font-*` CSS variables on `<html>`. */
export function brandFontCssVars(fonts: ResolvedBrandFonts): string {
  return [
    `--font-primary: ${fonts.fontPrimary}`,
    `--font-secondary: ${fonts.fontSecondary}`,
    `--font-content: ${fonts.fontContent}`,
  ].join('; ');
}
