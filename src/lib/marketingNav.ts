/**
 * Marketing site navigation — desktop bar + mobile drawer.
 */

export type MarketingNavLink = {
  href: string;
  label: string;
  /** Highlight as primary action (Demo CTA). */
  primary?: boolean;
  /** Open in a new tab (external demo sandbox). */
  external?: boolean;
  /** Omit from the compact desktop bar below this breakpoint (px). */
  hideBelow?: number;
};

export type MarketingNavGroup = {
  id: string;
  label: string;
  links: MarketingNavLink[];
};

/** Forward-facing pages — desktop bar + flattened mobile list. */
export const MARKETING_NAV_LINKS: MarketingNavLink[] = [
  { href: '/platform', label: 'Platform' },
  { href: '/compare', label: 'Compare' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/modules', label: 'Modules' },
  { href: '/deck', label: 'Walkthrough', hideBelow: 1080 },
  { href: '/about', label: 'About' },
  { href: '/services', label: 'Services' },
  { href: '/#contact', label: 'Contact' },
];

export const MARKETING_NAV_DEMO: MarketingNavLink = {
  href: '/demo',
  label: 'Demo',
  primary: true,
};

/** Mobile drawer — grouped for scanability. */
export const MARKETING_NAV_GROUPS: MarketingNavGroup[] = [
  {
    id: 'product',
    label: 'Product',
    links: [
      { href: '/platform', label: 'Platform' },
      { href: '/features', label: 'Features' },
      { href: '/compare', label: 'Compare' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/modules', label: 'Modules' },
      { href: '/demo', label: 'Demo', primary: true },
      { href: '/deck', label: 'Walkthrough' },
    ],
  },
  {
    id: 'company',
    label: 'Company',
    links: [
      { href: '/about', label: 'About' },
      { href: '/services', label: 'Services' },
      { href: '/about#portfolio', label: 'Portfolio' },
      { href: '/#contact', label: 'Contact' },
    ],
  },
];

export function marketingNavLinksForUser(_signedIn: boolean): MarketingNavLink[] {
  return MARKETING_NAV_LINKS;
}

export function marketingNavGroupsForUser(signedIn: boolean): MarketingNavGroup[] {
  if (!signedIn) return MARKETING_NAV_GROUPS;
  return MARKETING_NAV_GROUPS.map((group) => ({
    ...group,
    links: group.links.filter((link) => link.href !== '/demo'),
  }));
}

export function isMarketingPagePath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path === '/') return true;
  return (
    path === '/platform' ||
    path === '/features' ||
    path === '/compare' ||
    path === '/compare-2' ||
    path === '/pricing' ||
    path === '/demo' ||
    path === '/deck' ||
    path === '/about' ||
    path === '/services' ||
    path === '/modules' ||
    path === '/privacy' ||
    path === '/terms' ||
    path.startsWith('/form/')
  );
}

export function marketingNavActivePath(pathname: string, href: string): boolean {
  const path = pathname.replace(/\/$/, '') || '/';
  const hashIdx = href.indexOf('#');
  const targetPath = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const targetHash = hashIdx >= 0 ? href.slice(hashIdx + 1) : '';

  if (targetHash && (targetPath.replace(/\/$/, '') || '/') === '/') {
    return path === '/' && targetHash === 'contact';
  }

  if (targetHash) {
    const base = targetPath.replace(/\/$/, '') || '/';
    return path === base;
  }

  const target = targetPath.replace(/\/$/, '') || '/';
  if (target.startsWith('/#')) return false;
  return target === path;
}
