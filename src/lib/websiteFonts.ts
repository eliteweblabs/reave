/**
 * Detect typography from a public website — Google Fonts links + CSS font-family rules.
 * Maps families to the Reave brand font catalog (or registers Google Fonts on the fly).
 */
import * as cheerio from 'cheerio';
import { fetchHtml } from './clientBrand';
import {
  BRAND_FONT_CATALOG,
  ensureBrandFontEntry,
  type BrandFontRole,
} from './brandFonts';
import { normalizePublicUrl } from './publicUrl';

const SCRAPE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const MAX_STYLESHEETS = 8;
const MAX_STYLESHEET_BYTES = 750_000;

const SYSTEM_FONTS = new Set([
  'inherit',
  'initial',
  'unset',
  'revert',
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'ui-rounded',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'roboto',
  'helvetica',
  'helvetica neue',
  'arial',
  'arial nova',
  'nimbus sans',
  'times new roman',
  'times',
  'georgia',
  'courier',
  'courier new',
  'noto sans',
  'noto serif',
  'apple color emoji',
  'segoe ui emoji',
  'segoe ui symbol',
  'sf pro',
  'sf pro text',
  'sf pro display',
]);

const SERIF_HINTS = /(?:serif|slab|garamond|baskerville|merriweather|playfair|lora|crimson|libre baskerville|source serif|mozilla text)/i;

export type GoogleFontRef = {
  family: string;
  googleSpec: string;
};

export type ScoredFontFamily = {
  family: string;
  score: number;
  googleSpec?: string;
};

export type DetectedWebsiteFonts = {
  website: string;
  fontPrimaryId: string;
  fontSecondaryId: string;
  fontContentId: string;
  fontGoogleSpecs: Record<string, string>;
  detectedFamilies: string[];
  unmatchedFamilies: string[];
  sources: {
    primary: string;
    secondary: string;
    content: string;
  };
};

function normalizeFontFamily(raw: string): string | null {
  const first = raw
    .split(',')[0]
    ?.trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim();
  if (!first) return null;
  const key = first.toLowerCase();
  if (SYSTEM_FONTS.has(key)) return null;
  return first;
}

function slugifyFamily(family: string): string {
  return family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function extractGoogleFontRefs(html: string): GoogleFontRef[] {
  const refs: GoogleFontRef[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/href=["']([^"']*fonts\.googleapis\.com[^"']*)["']/gi)) {
    const href = match[1].replace(/&amp;/g, '&');
    for (const fm of href.matchAll(/family=([^&"']+)/gi)) {
      const segment = fm[1];
      const familyPart = segment.split(':')[0];
      let family = '';
      try {
        family = decodeURIComponent(familyPart.replace(/\+/g, ' ')).trim();
      } catch {
        family = familyPart.replace(/\+/g, ' ').trim();
      }
      if (!family) continue;
      const key = family.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({ family, googleSpec: segment });
    }
  }

  return refs;
}

function stylesheetUrls(html: string, pageUrl: string): string[] {
  const base = normalizePublicUrl(pageUrl, true);
  if (!base) return [];

  const $ = cheerio.load(html);
  const urls: string[] = [];
  const seen = new Set<string>();

  $('link[rel="stylesheet"], link[rel="preload"][as="style"]').each((_, el) => {
    const href = $(el).attr('href')?.trim();
    if (!href) return;
    try {
      const abs = new URL(href, base).toString();
      if (seen.has(abs)) return;
      seen.add(abs);
      urls.push(abs);
    } catch {
      // skip invalid
    }
  });

  return urls.slice(0, MAX_STYLESHEETS);
}

async function fetchStylesheetText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': SCRAPE_USER_AGENT, Accept: 'text/css,*/*' },
    });
    if (!res.ok) return '';
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_STYLESHEET_BYTES) return '';
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

function scoreFontInCss(css: string): Map<string, number> {
  const scores = new Map<string, number>();

  const add = (familyRaw: string, weight: number) => {
    const family = normalizeFontFamily(familyRaw);
    if (!family) return;
    scores.set(family, (scores.get(family) ?? 0) + weight);
  };

  for (const match of css.matchAll(
    /(?:^|[\s,{])(?:html|body)\b[^{]*\{[^}]*?font-family\s*:\s*([^;}{]+)/gim,
  )) {
    add(match[1], 12);
  }

  for (const match of css.matchAll(
    /(?:^|[\s,{])(?:h1|h2|h3|h4|h5|h6)\b[^{]*\{[^}]*?font-family\s*:\s*([^;}{]+)/gim,
  )) {
    add(match[1], 18);
  }

  for (const match of css.matchAll(
    /(?:^|[\s,{])(?:h1|h2|h3|h4|h5|h6)\s*,[^{]+\{[^}]*?font-family\s*:\s*([^;}{]+)/gim,
  )) {
    add(match[1], 18);
  }

  for (const match of css.matchAll(
    /(?:^|[\s,{])(?:nav|header|label|button|\.btn|\.kicker|\.eyebrow|\.subtitle)\b[^{]*\{[^}]*?font-family\s*:\s*([^;}{]+)/gim,
  )) {
    add(match[1], 10);
  }

  for (const match of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
    add(match[1], 1);
  }

  return scores;
}

function collectCssText(html: string): string {
  const $ = cheerio.load(html);
  const chunks: string[] = [];
  $('style').each((_, el) => {
    const text = $(el).html()?.trim();
    if (text) chunks.push(text);
  });
  return chunks.join('\n');
}

function mergeScores(
  cssScores: Map<string, number>,
  googleRefs: GoogleFontRef[],
): ScoredFontFamily[] {
  const combined = new Map<string, ScoredFontFamily>();

  for (const [family, score] of cssScores) {
    combined.set(family.toLowerCase(), { family, score });
  }

  for (const ref of googleRefs) {
    const key = ref.family.toLowerCase();
    const existing = combined.get(key);
    combined.set(key, {
      family: ref.family,
      score: (existing?.score ?? 0) + 24,
      googleSpec: ref.googleSpec,
    });
  }

  return [...combined.values()].sort((a, b) => b.score - a.score || a.family.localeCompare(b.family));
}

function isSerifFamily(family: string): boolean {
  return SERIF_HINTS.test(family);
}

function catalogIdForFamily(family: string, googleSpec?: string): string {
  const existing = BRAND_FONT_CATALOG.find(
    (entry) => entry.family.toLowerCase() === family.toLowerCase(),
  );
  if (existing) return existing.id;
  return ensureBrandFontEntry(family, googleSpec).id;
}

function pickRoleFont(
  ranked: ScoredFontFamily[],
  role: BrandFontRole,
  used: Set<string>,
): ScoredFontFamily | null {
  const available = ranked.filter((entry) => !used.has(entry.family.toLowerCase()));
  if (!available.length) return null;

  if (role === 'content') {
    const serif = available.find((entry) => isSerifFamily(entry.family));
    if (serif) return serif;
    return available.find((entry) => !isSerifFamily(entry.family)) ?? available[0];
  }

  if (role === 'secondary') {
    const ui = available.find((entry) => !isSerifFamily(entry.family));
    return ui ?? available[0];
  }

  const headline = available.find((entry) => !isSerifFamily(entry.family));
  return headline ?? available[0];
}

export function inferBrandFontsFromFamilies(
  ranked: ScoredFontFamily[],
  website: string,
): DetectedWebsiteFonts | null {
  if (!ranked.length) return null;

  const used = new Set<string>();
  const primary = pickRoleFont(ranked, 'primary', used);
  if (!primary) return null;
  used.add(primary.family.toLowerCase());

  const content = pickRoleFont(ranked, 'content', used) ?? primary;
  used.add(content.family.toLowerCase());

  const secondary = pickRoleFont(ranked, 'secondary', used) ?? primary;

  const fontPrimaryId = catalogIdForFamily(primary.family, primary.googleSpec);
  const fontSecondaryId = catalogIdForFamily(secondary.family, secondary.googleSpec);
  const fontContentId = catalogIdForFamily(content.family, content.googleSpec);

  const fontGoogleSpecs: Record<string, string> = {};
  for (const [id, entry] of [
    [fontPrimaryId, primary],
    [fontSecondaryId, secondary],
    [fontContentId, content],
  ] as const) {
    if (id.startsWith('google:') && entry.googleSpec) {
      fontGoogleSpecs[id] = entry.googleSpec;
    }
  }

  const detectedFamilies = ranked.map((entry) => entry.family);
  const unmatchedFamilies = detectedFamilies.filter((family) => {
    const slug = slugifyFamily(family);
    return !BRAND_FONT_CATALOG.some(
      (entry) => entry.id === slug || entry.family.toLowerCase() === family.toLowerCase(),
    );
  });

  return {
    website,
    fontPrimaryId,
    fontSecondaryId,
    fontContentId,
    fontGoogleSpecs,
    detectedFamilies,
    unmatchedFamilies,
    sources: {
      primary: primary.family,
      secondary: secondary.family,
      content: content.family,
    },
  };
}

export async function detectWebsiteFonts(urlInput: string): Promise<DetectedWebsiteFonts | null> {
  const start = normalizePublicUrl(urlInput, true);
  if (!start) return null;

  const fetched = await fetchHtml(start.toString());
  if (!fetched.ok) return null;

  const inlineCss = collectCssText(fetched.html);
  const cssScores = scoreFontInCss(inlineCss);
  const googleRefs = extractGoogleFontRefs(fetched.html);

  for (const sheetUrl of stylesheetUrls(fetched.html, fetched.finalUrl)) {
    const css = await fetchStylesheetText(sheetUrl);
    if (!css) continue;
    for (const [family, score] of scoreFontInCss(css)) {
      cssScores.set(family, (cssScores.get(family) ?? 0) + score);
    }
    for (const ref of extractGoogleFontRefs(css)) {
      const key = ref.family.toLowerCase();
      const existing = googleRefs.find((item) => item.family.toLowerCase() === key);
      if (!existing) googleRefs.push(ref);
    }
  }

  const ranked = mergeScores(cssScores, googleRefs);
  return inferBrandFontsFromFamilies(ranked, fetched.finalUrl);
}
