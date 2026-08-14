/**
 * Per-install / per-industry public website content — nav, allowed pages, homepage copy.
 *
 * Files: config/sites/{key}-config.json
 * Reave prod: reave-config.json
 * Demo installs: demo-{industry}-config.json (from ?industry= cookie)
 */
import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { getActiveDemoSuite } from './demoSuiteContext';
import { isDemoMode } from './demoMode';
import { getInstallConfig, installConfigSlug } from './installConfig';
import { serverEnv } from './serverEnv';

function normalizeDemoIndustry(raw: string | null | undefined): string {
  const slug = (raw ?? '').trim().toLowerCase();
  if (slug === 'plumbing' || slug === 'plumber') return 'plumbing';
  return 'general';
}

export type SiteNavLink = {
  href: string;
  label: string;
  primary?: boolean;
  external?: boolean;
  hideBelow?: number;
};

export type SiteNavGroup = {
  id: string;
  label: string;
  links: SiteNavLink[];
};

export type SiteHeroCta = {
  href: string;
  label: string;
  variant?: 'primary' | 'ghost';
};

export type SiteLandingProperty = {
  id: string;
  title: string;
  address: string;
  city: string;
  state?: string;
  zip?: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  year: number;
  type: string;
  district: string;
  image: string;
  lng: number;
  lat: number;
  featured?: boolean;
};

export type SiteLandingReview = {
  quote: string;
  cite: string;
  stars?: string;
};

/** Aggregated static marketing site — rendered when homepage.template === "landing". */
export type SiteLandingConfig = {
  title?: string;
  description?: string;
  ogImage?: string;
  themeColor?: string;
  /** "editorial" = Campion-style scrolling site. Default keeps the original navy landing. */
  variant?: "default" | "editorial";
  photo?: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
  };
  eyebrow?: string;
  name?: string;
  role?: string;
  tagline?: string;
  signature?: string;
  heroImage?: string;
  heroHeadline?: string;
  heroBody?: string;
  scheduleUrl?: string;
  vcfHref?: string;
  steps?: {
    heading: string;
    items: string[];
    ctaLabel?: string;
    ctaHref?: string;
  };
  numbers?: {
    heading: string;
    intro?: string;
    note?: string;
    stats: Array<{ value: string; label: string }>;
  };
  properties?: {
    heading: string;
    intro?: string;
    note?: string;
    items: SiteLandingProperty[];
  };
  map?: {
    heading: string;
    intro?: string;
    note?: string;
    lng?: number;
    lat?: number;
    zoom?: number;
  };
  reviews?: {
    heading: string;
    intro?: string;
    items: SiteLandingReview[];
  };
  about?: {
    heading: string;
    body?: string[];
    highlights?: string[];
  };
  inquiry?: {
    heading: string;
    intro: string;
    /** @deprecated Use /api/forms/submit — no client-side key needed. */
    web3formsAccessKey?: string;
    subject?: string;
    submitLabel?: string;
  };
  contact?: {
    heading: string;
    phone?: string;
    phoneHref?: string;
    email?: string;
    officeLines?: string[];
  };
  licensedStates?: {
    heading: string;
    states: string;
    nmlsLabel?: string;
    nmlsHref?: string;
  };
  footer?: string;
};

export type SiteContentConfig = {
  key: string;
  pages: string[];
  nav: {
    links: SiteNavLink[];
    groups: SiteNavGroup[];
    demoCta?: SiteNavLink;
    showDemoCta?: boolean;
    showSignIn?: boolean;
  };
  homepage: {
    /** "landing" = config-driven client site (no Reave marketing sections). */
    template?: 'default' | 'landing';
    heroHeadlineHtml: string;
    showHeroDemo?: boolean;
    showDialogue?: boolean;
    showIntegrations?: boolean;
    showFeatures?: boolean;
    showContact?: boolean;
    showLegalLinks?: boolean;
    ctas?: SiteHeroCta[];
  };
  /** Full landing-page copy when homepage.template is "landing". */
  landing?: SiteLandingConfig;
};

const _cache = new Map<string, SiteContentConfig>();

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function sitesDir(): string {
  const override = serverEnv('SITE_CONTENT_DIR')?.trim();
  if (override && existsSync(override)) return override;
  return join(projectRoot(), 'config', 'sites');
}

function configPathForKey(key: string): string {
  return join(sitesDir(), `${key}-config.json`);
}

function normalizePagePath(pathname: string): string {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path.startsWith('/form/')) return '/form/';
  return path;
}

function fallbackReaveConfig(): SiteContentConfig {
  return {
    key: 'reave',
    pages: [
      '/',
      '/platform',
      '/features',
      '/features-tight',
      '/compare',
      '/pricing',
      '/hosting',
      '/modules',
      '/demo',
      '/demo-loader',
      '/about',
      '/digital-audit',
      '/privacy',
      '/terms',
      '/cookies',
    ],
    nav: {
      links: [],
      groups: [],
      showDemoCta: false,
      showSignIn: true,
    },
    homepage: {
      heroHeadlineHtml: 'Small Business, <br class="home-hero-title-break" />Smaller Workday',
      showHeroDemo: true,
      showDialogue: true,
      showIntegrations: true,
      showFeatures: true,
      showContact: true,
      showLegalLinks: true,
    },
  };
}

export function loadSiteContentByKey(key: string): SiteContentConfig {
  const slug = key.trim().toLowerCase() || 'reave';
  const cached = _cache.get(slug);
  if (cached) return cached;

  const path = configPathForKey(slug);
  if (!existsSync(path)) {
    if (slug.startsWith('demo-')) {
      const general = loadSiteContentByKey('demo-general');
      _cache.set(slug, { ...general, key: slug });
      return _cache.get(slug)!;
    }
    const fallback = fallbackReaveConfig();
    _cache.set(slug, { ...fallback, key: slug });
    return _cache.get(slug)!;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as SiteContentConfig;
    const template = raw.homepage?.template === 'landing' ? 'landing' : 'default';
    const config: SiteContentConfig = {
      key: raw.key || slug,
      pages: Array.isArray(raw.pages) ? raw.pages.map(normalizePagePath) : ['/'],
      nav: {
        links: Array.isArray(raw.nav?.links) ? raw.nav.links : [],
        groups: Array.isArray(raw.nav?.groups) ? raw.nav.groups : [],
        demoCta: raw.nav?.demoCta,
        showDemoCta: raw.nav?.showDemoCta ?? false,
        showSignIn: raw.nav?.showSignIn ?? true,
      },
      homepage: {
        template,
        heroHeadlineHtml: raw.homepage?.heroHeadlineHtml ?? '',
        showHeroDemo: raw.homepage?.showHeroDemo ?? false,
        showDialogue: raw.homepage?.showDialogue ?? false,
        showIntegrations: raw.homepage?.showIntegrations ?? false,
        showFeatures: raw.homepage?.showFeatures ?? false,
        showContact: raw.homepage?.showContact ?? false,
        showLegalLinks: raw.homepage?.showLegalLinks ?? true,
        ctas: Array.isArray(raw.homepage?.ctas) ? raw.homepage.ctas : [],
      },
      landing: raw.landing && typeof raw.landing === 'object' ? raw.landing : undefined,
    };
    _cache.set(slug, config);
    return config;
  } catch {
    const fallback = fallbackReaveConfig();
    _cache.set(slug, fallback);
    return fallback;
  }
}

/** Resolve site content key for the active install / demo industry. */
export function resolveSiteContentKey(industryOverride?: string | null): string {
  if (isDemoMode()) {
    const suite = getActiveDemoSuite();
    const industry = normalizeDemoIndustry(industryOverride ?? suite?.industry);
    return `demo-${industry}`;
  }

  const install = getInstallConfig();
  const explicit = install.siteContentKey?.trim().toLowerCase();
  if (explicit) return explicit;

  const slug = installConfigSlug();
  if (slug === 'reave' || slug === 'default') return 'reave';
  return slug;
}

export function getSiteContent(opts?: { industry?: string | null }): SiteContentConfig {
  return loadSiteContentByKey(resolveSiteContentKey(opts?.industry));
}

export function isSitePageAllowed(pathname: string, site?: SiteContentConfig): boolean {
  const config = site ?? getSiteContent();
  const path = normalizePagePath(pathname);
  return config.pages.some((p) => normalizePagePath(p) === path);
}

export function isMarketingPagePath(pathname: string, site?: SiteContentConfig): boolean {
  const path = normalizePagePath(pathname);
  if (path === '/') return true;
  const config = site ?? getSiteContent();
  return config.pages.includes(path);
}

export function siteNavLinksForUser(signedIn: boolean, site?: SiteContentConfig): SiteNavLink[] {
  const config = site ?? getSiteContent();
  return config.nav.links;
}

export function siteNavGroupsForUser(signedIn: boolean, site?: SiteContentConfig): SiteNavGroup[] {
  const config = site ?? getSiteContent();
  if (!signedIn) return config.nav.groups;
  return config.nav.groups.map((group) => ({
    ...group,
    links: group.links.filter((link) => link.href !== '/demo'),
  }));
}

export function siteDemoCta(site?: SiteContentConfig): SiteNavLink | null {
  const config = site ?? getSiteContent();
  return config.nav.demoCta ?? null;
}

/** Public demo entry paths — "Demo now" is redundant (and confusing) here. */
export function isDemoEntryPath(pathname: string): boolean {
  const path = normalizePagePath(pathname);
  return path === '/demo' || path === '/demo-loader' || path === '/deck' || path.startsWith('/demo/');
}

export function siteShowDemoCta(
  signedIn: boolean,
  site?: SiteContentConfig,
  pathname?: string,
): boolean {
  if (signedIn) return false;
  if (pathname && isDemoEntryPath(pathname)) return false;
  const config = site ?? getSiteContent();
  return config.nav.showDemoCta ?? false;
}
