/**
 * Homepage chrome — marketing, client landing, or Clerk login.
 *
 * New / standalone installs have no public site yet — `/` stays a quiet
 * public page. Sign-in is `/admin/login` only. Official rekko.studio never
 * becomes a login wall.
 */

import {
  CANONICAL_PUBLIC_BRAND_DOMAIN,
  LEGACY_PUBLIC_BRAND_DOMAIN,
} from './legacyBrandDomain.ts';

export type HomepageTemplate = 'default' | 'landing' | 'login';

export function parseHomepageTemplate(raw: unknown): HomepageTemplate | undefined {
  return raw === 'default' || raw === 'landing' || raw === 'login' ? raw : undefined;
}

export function parseSiteHomepageTemplate(raw: unknown): HomepageTemplate {
  return raw === 'landing' || raw === 'login' ? raw : 'default';
}

/**
 * Effective homepage chrome.
 *
 * The visitor host wins: official rekko.studio stays marketing. Any other public host
 * is a client install — landing page when they have one, otherwise a quiet
 * public `/` (not a login wall). `INSTALL_CONFIG=reave` on a client domain
 * must not leak marketing.
 */
export function homepageTemplateFromConfig(opts: {
  siteTemplate?: HomepageTemplate;
  installTemplate?: HomepageTemplate;
  siteKey: string;
  hasLanding: boolean;
  hasWebsiteFeature: boolean;
  isCanonicalReave: boolean;
  isOfficialReaveHost: boolean;
  isDemo: boolean;
  requestHost?: string;
}): HomepageTemplate {
  const host = (opts.requestHost ?? '').trim().toLowerCase();
  const onReaveHost =
    host === CANONICAL_PUBLIC_BRAND_DOMAIN ||
    host === LEGACY_PUBLIC_BRAND_DOMAIN ||
    (!host && (opts.isOfficialReaveHost || opts.isCanonicalReave));

  if (onReaveHost) {
    return opts.siteTemplate === 'landing' && opts.hasLanding ? 'landing' : 'default';
  }
  if (opts.isDemo) {
    return opts.siteTemplate === 'landing' && opts.hasLanding ? 'landing' : 'default';
  }
  if (opts.siteKey === 'barbersedge') return 'default';
  if ((opts.siteTemplate === 'landing' || opts.installTemplate === 'landing') && opts.hasLanding) {
    return 'landing';
  }
  return 'login';
}
