/**
 * Search keywords & alternate spellings — company-wide terms prepended to per-page lists
 * (JSON-LD, directory/name search, sales-sheet competitor queries).
 */
import type { CompanyConfig } from './companyConfig';
import type { SiteLandingConfig, SiteNavLink } from './siteContent';
import type { LuxuryPageId } from './luxurySitePage';

export function parseSearchKeywordLines(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      const v = String(item ?? '').trim();
      if (!v) continue;
      if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
    }
    return out;
  }
  if (typeof raw === 'string') {
    const out: string[] = [];
    for (const line of raw.split(/[\n,]+/)) {
      const v = line.trim();
      if (!v) continue;
      if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
    }
    return out;
  }
  return [];
}

export function mergeSearchKeywordLists(...lists: (string[] | undefined | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    if (!list?.length) continue;
    for (const term of list) {
      const v = term.trim();
      if (!v) continue;
      const key = v.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

function normalizePath(pathname: string): string {
  const raw = (pathname || '/').split('#')[0]?.split('?')[0] ?? '/';
  const collapsed = raw.replace(/\/{2,}/g, '/');
  return collapsed.replace(/\/$/, '') || '/';
}

function luxuryPageIdFromPath(pathname: string, landing: SiteLandingConfig): LuxuryPageId | null {
  const path = normalizePath(pathname);
  if (path === '/') return 'home';
  if (!Array.isArray(landing.nav) || !landing.nav.length) return null;
  for (const link of landing.nav) {
    const href = normalizePath(link.href || '');
    if (href === path) {
      const label = (link.label || '').toLowerCase();
      if (label.includes('service')) return 'services';
      if (label.includes('pric')) return 'pricing';
      if (label.includes('about')) return 'about';
      if (label.includes('contact')) return 'contact';
      return 'home';
    }
  }
  return null;
}

function keywordsFromNavLink(link: SiteNavLink | undefined): string[] {
  if (!link) return [];
  const raw = (link as SiteNavLink & { searchKeywords?: unknown }).searchKeywords;
  return parseSearchKeywordLines(raw);
}

function autoKeywordsForLuxuryPage(page: LuxuryPageId, landing: SiteLandingConfig): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const v = value.trim();
    if (v && !out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
  };

  if (page === 'home' || page === 'services') {
    for (const item of landing.services?.items ?? []) {
      if (typeof item === 'string') push(item);
      else if (item?.label) push(item.label);
    }
  }
  if (page === 'home' || page === 'pricing') {
    for (const tier of landing.pricing?.tiers ?? []) {
      if (tier?.name) push(tier.name);
    }
  }
  if (page === 'home' || page === 'about') {
    for (const city of landing.areas?.cities ?? []) push(city);
    if (landing.about?.heading) push(landing.about.heading);
  }
  if (page === 'home') {
    if (landing.heroHeadline) push(landing.heroHeadline);
    if (landing.tagline) push(landing.tagline);
  }
  return out;
}

/** Terms inferred from the active landing page (services, cities, headlines, etc.). */
export function deriveAutoPageSearchKeywords(
  pathname: string,
  landing: SiteLandingConfig | null | undefined,
): string[] {
  if (!landing) return [];
  const path = normalizePath(pathname);
  const pageId = luxuryPageIdFromPath(path, landing);
  if (pageId) return autoKeywordsForLuxuryPage(pageId, landing);

  if (path === '/') {
    const bits: string[] = [];
    if (landing.heroHeadline) bits.push(landing.heroHeadline);
    if (landing.tagline) bits.push(landing.tagline);
    if (landing.services?.heading) bits.push(landing.services.heading);
    return parseSearchKeywordLines(bits.join('\n'));
  }

  const navLink = (landing.nav ?? []).find((link) => normalizePath(link.href) === path);
  if (navLink?.label) return [navLink.label.trim()];
  return [];
}

function pageOverrideKeywords(
  pathname: string,
  landing: SiteLandingConfig | null | undefined,
): string[] {
  if (!landing) return [];
  const path = normalizePath(pathname);
  const landingWide = parseSearchKeywordLines(
    (landing as SiteLandingConfig & { searchKeywords?: unknown }).searchKeywords,
  );
  if (path === '/') return landingWide;

  const navLink = (landing.nav ?? []).find((link) => normalizePath(link.href) === path);
  const fromNav = keywordsFromNavLink(navLink);
  if (fromNav.length) return fromNav;
  return landingWide;
}

/**
 * Company aliases first, then optional site-config overrides, then auto-derived page terms.
 */
export function resolvePageSearchKeywords(opts: {
  company: Pick<CompanyConfig, 'searchKeywords' | 'name'>;
  landing?: SiteLandingConfig | null;
  pathname?: string;
}): string[] {
  const companyTerms = opts.company.searchKeywords ?? [];
  const landing = opts.landing ?? null;
  const pathname = opts.pathname ?? '/';
  const overrides = pageOverrideKeywords(pathname, landing);
  const auto = deriveAutoPageSearchKeywords(pathname, landing);
  return mergeSearchKeywordLists(companyTerms, overrides, auto);
}

/** Comma-separated meta keywords / JSON-LD keywords property. */
export function formatSearchKeywordsMeta(keywords: string[]): string | null {
  const list = mergeSearchKeywordLists(keywords);
  if (!list.length) return null;
  return list.join(', ');
}
