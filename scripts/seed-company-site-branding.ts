#!/usr/bin/env npx tsx
/**
 * Copy public/sites/{slug}/ logo.png, icon.png, og.png into company_config.
 *
 * Usage:
 *   DATABASE_URL=… INSTALL_CONFIG=luxe-cleaning npx tsx scripts/seed-company-site-branding.ts
 *   … --force   overwrite existing raster branding
 */
import { loadSiteBrandingAssets, resolveSiteBrandingSlug } from '../src/lib/siteBrandingAssets.ts';
import { getStoredCompanyConfig, setStoredCompanyConfig } from '../src/lib/companyConfigStore.ts';

const force = process.argv.includes('--force');

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required');
  }

  const slug = resolveSiteBrandingSlug();
  if (!slug) throw new Error('Could not resolve site branding slug (set INSTALL_CONFIG or COMPANY_SITE_BRANDING)');

  const assets = loadSiteBrandingAssets(slug);
  if (!assets) throw new Error(`No branding files under public/sites/${slug}/`);

  const existing = await getStoredCompanyConfig();
  const patch: Parameters<typeof setStoredCompanyConfig>[0] = {};

  if (assets.logo && (force || !existing?.logoData?.trim())) {
    patch.logoData = assets.logo.dataBase64;
    patch.logoMediaType = assets.logo.mediaType;
    patch.logoPath = null;
  }
  if (assets.icon && (force || !existing?.iconData?.trim())) {
    patch.iconData = assets.icon.dataBase64;
    patch.iconMediaType = assets.icon.mediaType;
    patch.iconPath = null;
  }
  if (assets.og && (force || !existing?.ogData?.trim())) {
    patch.ogData = assets.og.dataBase64;
    patch.ogMediaType = assets.og.mediaType;
  }

  if (!Object.keys(patch).length) {
    console.log(`[seed-site-branding] nothing to write for ${slug} (use --force to overwrite)`);
    return;
  }

  const ok = await setStoredCompanyConfig(patch);
  if (!ok) throw new Error('Failed to write company_config');
  console.log(`[seed-site-branding] wrote ${Object.keys(patch).join(', ')} from public/sites/${slug}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
