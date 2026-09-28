/**
 * Co-located PNGs under public/sites/{slug}/ — logo, icon, og.png.
 * Used at install bootstrap to copy site front-end branding into company_config.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installConfigSlug } from './installConfig';
import { getSiteContent } from './siteContent';
import { projectRoot } from './projectRoot';
import { serverEnv } from './serverEnv';

export type SiteBrandingRaster = {
  dataBase64: string;
  mediaType: 'image/png';
};

export type SiteBrandingBundle = {
  slug: string;
  logo?: SiteBrandingRaster;
  icon?: SiteBrandingRaster;
  og?: SiteBrandingRaster;
};

function readSitePng(dir: string, filename: string): SiteBrandingRaster | undefined {
  const path = join(dir, filename);
  if (!existsSync(path)) return undefined;
  return {
    dataBase64: readFileSync(path).toString('base64'),
    mediaType: 'image/png',
  };
}

/** Slug for public/sites/{slug} — env override, install config, or site content key. */
export function resolveSiteBrandingSlug(): string | null {
  const explicit = (serverEnv('COMPANY_SITE_BRANDING') ?? '').trim();
  if (explicit) return explicit;

  const install = installConfigSlug();
  if (install && install !== 'reave' && install !== 'default') return install;

  const key = getSiteContent().key?.trim();
  if (key && key !== 'reave' && key !== 'default') return key;

  return null;
}

export function loadSiteBrandingAssets(slug: string): SiteBrandingBundle | null {
  const safe = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
  if (!safe) return null;

  const dir = join(projectRoot(), 'public', 'sites', safe);
  if (!existsSync(dir)) return null;

  const logo = readSitePng(dir, 'logo.png');
  const icon = readSitePng(dir, 'icon.png');
  const og = readSitePng(dir, 'og.png');

  if (!logo && !icon && !og) return null;

  return { slug: safe, logo, icon, og };
}
