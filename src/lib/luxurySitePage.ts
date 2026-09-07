import type { AstroGlobal } from 'astro';
import { resolvePublicHost } from './requestHost';
import {
  getSiteContent,
  resolveHomepageTemplate,
  type SiteLandingConfig,
} from './siteContent';

export type LuxuryPageId = 'home' | 'services' | 'pricing' | 'about' | 'contact';

export function isLuxuryMultiPage(landing: SiteLandingConfig): boolean {
  return Array.isArray(landing.nav) && landing.nav.length > 0;
}

export function luxuryPageTitle(page: LuxuryPageId, landing: SiteLandingConfig): string {
  const titles: Record<LuxuryPageId, string> = {
    home: landing.name || 'Home',
    services: landing.services?.heading || 'Services',
    pricing: landing.pricing?.heading || 'Pricing',
    about: landing.about?.heading || 'About',
    contact: landing.contact?.heading || 'Contact',
  };
  return titles[page];
}

const SECTION_PAGES: Record<string, LuxuryPageId> = {
  hero: 'home',
  trust: 'home',
  steps: 'home',
  services: 'services',
  pricing: 'pricing',
  includes: 'pricing',
  about: 'about',
  gallery: 'about',
  areas: 'about',
  reviews: 'about',
  faq: 'contact',
  contact: 'contact',
};

export function luxuryShowsSection(
  page: LuxuryPageId | 'all',
  section: keyof typeof SECTION_PAGES,
  landing: SiteLandingConfig,
): boolean {
  if (!isLuxuryMultiPage(landing)) return true;
  if (page === 'all') return SECTION_PAGES[section] === 'home';
  return page === SECTION_PAGES[section];
}

/** When the active install uses luxury multi-page nav, return landing config. */
export function getLuxurySitePage(
  request: Request,
  _page?: LuxuryPageId,
): { landing: SiteLandingConfig } | null {
  const siteContent = getSiteContent();
  const template = resolveHomepageTemplate(siteContent, {
    requestHost: resolvePublicHost(request),
  });
  const landing = siteContent.landing;
  if (template !== 'landing' || landing?.variant !== 'luxury') return null;
  if (!isLuxuryMultiPage(landing)) return null;
  return { landing };
}

export function resolveLuxurySitePage(
  Astro: Pick<AstroGlobal, 'redirect' | 'request'>,
  page: LuxuryPageId,
): { landing: SiteLandingConfig } | Response {
  const resolved = getLuxurySitePage(Astro.request, page);
  if (!resolved) return Astro.redirect('/');
  return resolved;
}

export function luxuryNavLinks(
  landing: SiteLandingConfig,
): Array<{ href: string; label: string }> {
  if (isLuxuryMultiPage(landing)) {
    return landing.nav!.map((link) => ({
      href: link.href,
      label: link.label,
    }));
  }

  return [
    landing.services ? { href: '#services', label: 'Services' } : null,
    landing.pricing ? { href: '#pricing', label: 'Pricing' } : null,
    landing.includes ? { href: '#includes', label: 'Checklist' } : null,
    landing.gallery?.photos?.length ? { href: '#gallery', label: 'Gallery' } : null,
    landing.about ? { href: '#about', label: 'About' } : null,
    landing.faq ? { href: '#faq', label: 'FAQ' } : null,
    landing.contact ? { href: '#contact', label: 'Contact' } : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>;
}

export function luxuryNavIsActive(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  const target = href.replace(/\/$/, '') || '/';
  if (target.startsWith('#')) return false;
  return path === target;
}
