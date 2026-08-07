/**
 * Marketing site navigation — desktop bar + mobile drawer.
 * Content is driven by config/sites/{key}-config.json via siteContent.ts.
 */
export type { SiteHeroCta, SiteNavGroup, SiteNavLink } from './siteContent';
export {
  getSiteContent,
  isDemoEntryPath,
  isMarketingPagePath,
  isSitePageAllowed,
  siteDemoCta,
  siteNavGroupsForUser,
  siteNavLinksForUser,
  siteShowDemoCta,
} from './siteContent';

/** @deprecated Use siteNavLinksForUser — kept for imports that expect the old name. */
export { siteNavLinksForUser as marketingNavLinksForUser } from './siteContent';

/** @deprecated Use siteNavGroupsForUser */
export { siteNavGroupsForUser as marketingNavGroupsForUser } from './siteContent';

/** @deprecated Use siteDemoCta */
export { siteDemoCta as MARKETING_NAV_DEMO_FALLBACK } from './siteContent';

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
