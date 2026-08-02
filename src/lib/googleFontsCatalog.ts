/**
 * Full Google Fonts catalog for admin Company typography.
 * Fetched from fonts.google.com metadata (no API key) and cached in memory.
 */
import {
  BRAND_FONT_CATALOG,
  type BrandFontOption,
  type BrandFontRole,
} from './brandFonts';

const ALL_ROLES: BrandFontRole[] = ['primary', 'secondary', 'content'];
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const METADATA_URL = 'https://fonts.google.com/metadata/fonts';

type MetadataFont = {
  family?: string;
  fonts?: Record<string, unknown>;
  axes?: Array<{ tag: string; min: number; max: number }>;
  defaultSort?: number;
};

let cache: { at: number; fonts: BrandFontOption[] } | null = null;

function buildGoogleSpec(
  family: string,
  fontKeys: string[],
  axes?: MetadataFont['axes'],
): string {
  const encoded = family.replace(/\s+/g, '+');
  const keys = fontKeys.length ? fontKeys : ['400'];
  const hasItalic = keys.some((key) => key.endsWith('i'));
  const weights = [
    ...new Set(
      keys
        .map((key) => (key.endsWith('i') ? key.slice(0, -1) : key))
        .filter((key) => /^\d+$/.test(key))
        .map((key) => Number(key)),
    ),
  ].sort((a, b) => a - b);
  const preferred = [400, 500, 600, 700].filter((weight) => weights.includes(weight));
  const use = preferred.length ? preferred : weights.slice(0, 4);

  const wghtAxis = axes?.find((axis) => axis.tag === 'wght');
  const opszAxis = axes?.find((axis) => axis.tag === 'opsz');
  if (wghtAxis && opszAxis) {
    const opsz = `${opszAxis.min}..${opszAxis.max}`;
    const pairs = use.map((weight) => `0,${opsz},${weight}`);
    if (hasItalic) pairs.push(`1,${opsz},400`);
    return `${encoded}:ital,opsz,wght@${pairs.join(';')}`;
  }

  if (hasItalic) {
    return `${encoded}:ital,wght@${use.flatMap((weight) => [`0,${weight}`, `1,${weight}`]).slice(0, 6).join(';')}`;
  }

  return `${encoded}:wght@${use.join(';')}`;
}

async function fetchMetadataCatalog(): Promise<BrandFontOption[]> {
  const res = await fetch(METADATA_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Google Fonts metadata HTTP ${res.status}`);

  const data = (await res.json()) as { familyMetadataList?: MetadataFont[] };
  const list = [...(data.familyMetadataList ?? [])];
  list.sort((a, b) => (a.defaultSort ?? 9999) - (b.defaultSort ?? 9999));

  const curatedFamilies = new Set(
    BRAND_FONT_CATALOG.map((entry) => entry.family.toLowerCase()),
  );
  const fonts: BrandFontOption[] = [];

  for (const item of list) {
    const family = item.family?.trim();
    if (!family || curatedFamilies.has(family.toLowerCase())) continue;
    fonts.push({
      id: `google:${family}`,
      label: family,
      family,
      googleSpec: buildGoogleSpec(family, Object.keys(item.fonts ?? {}), item.axes),
      roles: ALL_ROLES,
    });
  }

  return fonts;
}

/** All Google Fonts minus entries already in the curated catalog. */
export async function getGoogleFontsCatalog(): Promise<BrandFontOption[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.fonts;
  try {
    const fonts = await fetchMetadataCatalog();
    cache = { at: Date.now(), fonts };
    return fonts;
  } catch {
    return cache?.fonts ?? [];
  }
}

export type AdminFontCatalogEntry = Pick<
  BrandFontOption,
  'id' | 'label' | 'roles' | 'googleSpec' | 'family'
>;

/** Curated fonts first, then the full Google Fonts library (by popularity). */
export async function brandFontCatalogForAdminAsync(): Promise<AdminFontCatalogEntry[]> {
  const googleFonts = await getGoogleFontsCatalog();
  const merged = [...BRAND_FONT_CATALOG, ...googleFonts];
  const seen = new Set<string>();
  return merged
    .filter((entry) => {
      if (seen.has(entry.id)) return false;
      seen.add(entry.id);
      return true;
    })
    .map(({ id, label, roles, googleSpec, family }) => ({
      id,
      label,
      roles,
      googleSpec,
      family,
    }));
}

const catalogById = () => {
  const map = new Map<string, BrandFontOption>();
  for (const entry of BRAND_FONT_CATALOG) map.set(entry.id, entry);
  for (const entry of cache?.fonts ?? []) map.set(entry.id, entry);
  return map;
};

/** Resolve a Google Fonts CSS2 spec for a catalog id (used when saving company fonts). */
export async function googleSpecForFontId(id: string | null | undefined): Promise<string | null> {
  const key = (id ?? '').trim();
  if (!key) return null;

  const hit = catalogById().get(key);
  if (hit) return hit.googleSpec;

  if (key.startsWith('google:')) {
    await getGoogleFontsCatalog();
    return catalogById().get(key)?.googleSpec ?? null;
  }

  return null;
}

export async function mergeFontGoogleSpecs(
  stored: Record<string, string> | null | undefined,
  ids: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const merged = { ...(stored ?? {}) };
  for (const id of ids) {
    if (!id?.startsWith('google:')) continue;
    const spec = await googleSpecForFontId(id);
    if (spec) merged[id] = spec;
  }
  return merged;
}
