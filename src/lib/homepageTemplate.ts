/**
 * Homepage chrome — marketing, client landing, or Clerk login.
 *
 * New / standalone installs are unbranded login until Company settings (DB)
 * or that install’s own site config supplies a public site. Official REΛVE
 * never becomes a login wall.
 */

export type HomepageTemplate = 'default' | 'landing' | 'login';

export function parseHomepageTemplate(raw: unknown): HomepageTemplate | undefined {
  return raw === 'default' || raw === 'landing' || raw === 'login' ? raw : undefined;
}

export function parseSiteHomepageTemplate(raw: unknown): HomepageTemplate {
  return raw === 'landing' || raw === 'login' ? raw : 'default';
}

/**
 * Effective homepage chrome. Official REΛVE never becomes a login wall —
 * even if a copied client config sets `homepage.template` / `homepageTemplate` to `login`.
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
}): HomepageTemplate {
  if (opts.isOfficialReaveHost || opts.isCanonicalReave) {
    return opts.siteTemplate === 'landing' && opts.hasLanding ? 'landing' : 'default';
  }
  if (opts.isDemo) {
    return opts.siteTemplate === 'landing' && opts.hasLanding ? 'landing' : 'default';
  }
  if (opts.siteTemplate === 'login' || opts.installTemplate === 'login') return 'login';
  if (opts.siteKey === 'barbersedge') return 'default';
  if ((opts.siteTemplate === 'landing' || opts.installTemplate === 'landing') && opts.hasLanding) {
    return 'landing';
  }
  if (!opts.hasWebsiteFeature) return 'login';
  return opts.siteTemplate === 'landing' && opts.hasLanding ? 'landing' : 'default';
}
