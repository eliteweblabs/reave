import { projectRoot } from './projectRoot';
/**
 * Public website chrome — nav, allowed pages, homepage template.
 *
 * Company name, logo, and copy come from admin Company settings (Postgres) or
 * that install’s own `config/sites/{key}-config.json`. A new install without a
 * site file is unbranded (Clerk login on `/`) — it must not inherit reave.app
 * marketing. Official reave.app still uses `reave-config.json`.
 *
 * Demo installs: demo-{industry}-config.json (from ?industry= cookie)
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { getActiveDemoSuite } from './demoSuiteContext';
import { isDemoMode } from './demoMode';
import {
  homepageTemplateFromConfig,
  parseSiteHomepageTemplate,
  type HomepageTemplate,
} from './homepageTemplate';
import { getRequestPublicHost, isReaveMarketingHost, publicHostFromEnv } from './requestHost';
import {
  getInstallConfigSync,
  installConfigSlug,
  isCanonicalReaveInstall,
  isOfficialReavePublicHost,
} from './installConfig';
import { serverEnv } from './serverEnv';
import { siteMediaSrc } from './siteMedia';

export type { HomepageTemplate };
export { homepageTemplateFromConfig };

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

export type SiteClientLogo = {
  name: string;
  image: string;
  width: number;
  height: number;
};

export type SitePortfolioSize = '1x1' | '2x1' | '3x1' | '1x2' | '2x2' | '3x2' | '4x1';

export type SiteImageOrientation = 'horizontal' | 'vertical';

export type SitePortfolioAlternateImage = {
  image: string;
  imageAlt?: string;
  imagePosition?: string;
};

export type SitePortfolioItem = {
  title: string;
  description: string;
  tags: string[];
  image: string;
  imageAlt: string;
  size: SitePortfolioSize;
  /** Best-fit crop: landscape tiles span two units, portrait tiles span one. */
  imageOrientation?: SiteImageOrientation;
  /** CSS object-position inside the tile (e.g. "right", "center top", "80% 40%"). */
  imagePosition?: string;
  /** Extra shots kept on the item but not shown on the tile yet. */
  alternateImages?: SitePortfolioAlternateImage[];
  /** When true, this item can appear in the homepage featured-project section. */
  featured?: boolean;
  /** Optional live-site or deep link for the homepage featured section. */
  href?: string;
};

const OBJECT_POSITION_TOKEN = /^(?:left|right|center|top|bottom|-?\d+(?:\.\d+)?(?:%|px)?)$/;

export function resolveImagePosition(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const parts = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) return undefined;
  if (!parts.every((part) => OBJECT_POSITION_TOKEN.test(part))) return undefined;
  return parts.join(' ');
}

function resolvePortfolioHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const href = raw.trim();
  if (!href) return undefined;
  if (href.startsWith('/') && !href.startsWith('//')) return href;
  try {
    const url = new URL(href);
    if (url.protocol === 'http:' || url.protocol === 'https:') return href;
  } catch {
    return undefined;
  }
  return undefined;
}

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
  /** Per-page share image. Overrides admin → Company → Social sharing. */
  ogImage?: string;
  themeColor?: string;
  /**
   * `editorial` = Campion-style scrolling site.
   * `service` = mobile call-first single page (trades / emergency).
   * Default keeps the original navy landing.
   */
  variant?: "default" | "editorial" | "service";
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
  /** Sticky / hero call labels for `service` landings. */
  callCta?: {
    label?: string;
    stickyLabel?: string;
  };
  /** Plain service list for `service` landings (no map / directions). */
  services?: {
    heading: string;
    items: Array<string | { label: string; icon?: string }>;
  };
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
  /** Full-bleed footer art (e.g. skyline banner). */
  footerImage?: string;
  /** Static hero logo path — prefers over company branding when set. */
  heroLogo?: string;
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
    /**
     * `landing` = config-driven client site (no Reave marketing sections).
     * `login` = Clerk sign-in on `/` for standalone admin installs.
     * Official reave.app (`reave.app`) never honors `login`.
     */
    template?: HomepageTemplate;
    heroHeadlineHtml: string;
    /** Quiet public `/` line under the company name (login homepage). */
    subtitle?: string;
    showHeroDemo?: boolean;
    showDialogue?: boolean;
    showIntegrations?: boolean;
    showFeatures?: boolean;
    showContact?: boolean;
    showLegalLinks?: boolean;
    ctas?: SiteHeroCta[];
    /** Scene id → media slug for hero demo avatars. */
    heroDemoAvatars?: Record<string, string>;
  };
  /** Full landing-page copy when homepage.template is "landing". */
  landing?: SiteLandingConfig;
  /** About-page office / team photo (media slug or URL). */
  aboutImage?: string;
  clientLogos?: SiteClientLogo[];
  portfolio?: SitePortfolioItem[];
};

function resolveHeroDemoAvatars(
  raw: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const src = siteMediaSrc(value);
    if (src) out[key] = src;
  }
  return Object.keys(out).length ? out : undefined;
}

function resolveClientLogos(raw: SiteClientLogo[] | undefined): SiteClientLogo[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const logos = raw
    .map((logo) => ({
      name: String(logo.name || '').trim(),
      image: siteMediaSrc(logo.image),
      width: Number(logo.width) || 24,
      height: Number(logo.height) || 24,
    }))
    .filter((logo) => logo.name && logo.image);
  return logos.length ? logos : undefined;
}

const PORTFOLIO_SIZES = new Set<SitePortfolioSize>(['1x1', '2x1', '3x1', '1x2', '2x2', '3x2', '4x1']);

function resolveOrientation(
  raw: unknown,
  size: SitePortfolioSize,
): SiteImageOrientation {
  if (raw === 'horizontal' || raw === 'vertical') return raw;
  if (size === '1x2' || size === '2x2') return 'vertical';
  return 'horizontal';
}

function resolvePortfolio(raw: SitePortfolioItem[] | undefined): SitePortfolioItem[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const items = raw
    .map((item) => {
      const size = PORTFOLIO_SIZES.has(item.size) ? item.size : '2x1';
      return {
        title: String(item.title || '').trim(),
        description: String(item.description || '').trim(),
        tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t)) : [],
        image: siteMediaSrc(item.image),
        imageAlt: String(item.imageAlt || item.title || '').trim(),
        size,
        imageOrientation: resolveOrientation(item.imageOrientation, size),
        imagePosition: resolveImagePosition(item.imagePosition),
        alternateImages: Array.isArray(item.alternateImages)
          ? item.alternateImages
              .map((alt) => ({
                image: siteMediaSrc(alt.image),
                imageAlt: String(alt.imageAlt || '').trim() || undefined,
                imagePosition: resolveImagePosition(alt.imagePosition),
              }))
              .filter((alt) => alt.image)
          : undefined,
        featured: item.featured === true,
        href: resolvePortfolioHref(item.href),
      };
    })
    .filter((item) => item.title && item.image);
  return items.length ? items : undefined;
}

function resolveLandingMedia(landing: SiteLandingConfig): SiteLandingConfig {
  const next = { ...landing };
  if (next.ogImage) next.ogImage = siteMediaSrc(next.ogImage);
  if (next.heroImage) next.heroImage = siteMediaSrc(next.heroImage);
  if (next.photo?.src) {
    next.photo = { ...next.photo, src: siteMediaSrc(next.photo.src) };
  }
  if (next.properties?.items) {
    next.properties = {
      ...next.properties,
      items: next.properties.items.map((item) => ({
        ...item,
        image: siteMediaSrc(item.image) || item.image,
      })),
    };
  }
  return next;
}

const _cache = new Map<string, SiteContentConfig>();


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
  if (path === '/barbers' || path.startsWith('/barbers/')) return '/barbers';
  return path;
}

function fallbackStandaloneConfig(key: string): SiteContentConfig {
  return {
    key,
    pages: ['/', '/card', '/privacy', '/terms', '/cookies'],
    nav: {
      links: [],
      groups: [],
      showDemoCta: false,
      showSignIn: true,
    },
    homepage: {
      template: 'login',
      heroHeadlineHtml: '',
      showHeroDemo: false,
      showDialogue: false,
      showIntegrations: false,
      showFeatures: false,
      showContact: false,
      showLegalLinks: false,
    },
  };
}

function fallbackReaveConfig(): SiteContentConfig {
  return {
    key: 'reave',
    pages: [
      '/',
      '/card',
      '/platform',
      '/features',
      '/features-tight',
      '/compare',
      '/pricing',
      '/hosting',
      '/modules',
      '/demo',
      '/demo-loader',
      '/demo-five',
      '/deploy',
      '/about',
      '/digital-audit',
      '/privacy',
      '/terms',
      '/cookies',
      '/barbers',
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
      showDialogue: false,
      showIntegrations: false,
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
    const fallback = slug === 'reave' ? { ...fallbackReaveConfig(), key: slug } : fallbackStandaloneConfig(slug);
    _cache.set(slug, fallback);
    return fallback;
  }

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as SiteContentConfig;
    const template = parseSiteHomepageTemplate(raw.homepage?.template);
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
        subtitle: typeof raw.homepage?.subtitle === 'string' ? raw.homepage.subtitle.trim() : undefined,
        showHeroDemo: raw.homepage?.showHeroDemo ?? false,
        showDialogue: raw.homepage?.showDialogue ?? false,
        showIntegrations: raw.homepage?.showIntegrations ?? false,
        showFeatures: raw.homepage?.showFeatures ?? false,
        showContact: raw.homepage?.showContact ?? false,
        showLegalLinks: raw.homepage?.showLegalLinks ?? true,
        ctas: Array.isArray(raw.homepage?.ctas) ? raw.homepage.ctas : [],
        heroDemoAvatars: resolveHeroDemoAvatars(raw.homepage?.heroDemoAvatars),
      },
      landing: raw.landing && typeof raw.landing === 'object' ? resolveLandingMedia(raw.landing) : undefined,
      aboutImage: siteMediaSrc(raw.aboutImage) || undefined,
      clientLogos: resolveClientLogos(raw.clientLogos),
      portfolio: resolvePortfolio(raw.portfolio),
    };
    _cache.set(slug, config);
    return config;
  } catch {
    const fallback = slug === 'reave' ? fallbackReaveConfig() : fallbackStandaloneConfig(slug);
    _cache.set(slug, fallback);
    return fallback;
  }
}

export function clearSiteContentCache(): void {
  _cache.clear();
}

export function resolveHomepageTemplate(
  site?: SiteContentConfig,
  opts?: { requestHost?: string },
): HomepageTemplate {
  const content = site ?? getSiteContent();
  return homepageTemplateFromConfig({
    siteTemplate: content.homepage.template ?? 'default',
    installTemplate: getInstallConfigSync().homepageTemplate,
    siteKey: content.key,
    hasLanding: Boolean(content.landing),
    hasWebsiteFeature: getInstallConfigSync().features.includes('website'),
    isCanonicalReave: isCanonicalReaveInstall(),
    isOfficialReaveHost: isOfficialReavePublicHost(),
    isDemo: isDemoMode(),
    requestHost: opts?.requestHost || getRequestPublicHost() || publicHostFromEnv(),
  });
}

/** Resolve site content key for the active install / demo industry. */
export function resolveSiteContentKey(industryOverride?: string | null): string {
  if (isDemoMode()) {
    const suite = getActiveDemoSuite();
    const industry = normalizeDemoIndustry(industryOverride ?? suite?.industry);
    return `demo-${industry}`;
  }

  const install = getInstallConfigSync();
  const explicit = install.siteContentKey?.trim().toLowerCase();
  const slug = installConfigSlug();
  const host = getRequestPublicHost() || publicHostFromEnv();

  // Client domain + leaked reave.app site key → unbranded standalone chrome.
  if (host && !isReaveMarketingHost(host) && (explicit === 'reave' || slug === 'reave')) {
    return slug !== 'reave' && slug !== 'default' ? slug : 'default';
  }

  if (explicit) return explicit;
  if (slug === 'reave') return 'reave';
  if (slug === 'default') return isCanonicalReaveInstall() || isOfficialReavePublicHost() ? 'reave' : 'default';
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
