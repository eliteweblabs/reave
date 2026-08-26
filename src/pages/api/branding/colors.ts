import type { APIRoute } from 'astro';
import { jsonResponse } from '../../../lib/apiResponse';
import {
  DEFAULT_SITE_BRAND_PRIMARY,
  DEFAULT_SITE_BRAND_SECONDARY,
  normalizeBrandColorHex,
  resolveCompanyBrandColors,
} from '../../../lib/companyBrandColors';
import { getStoredCompanyConfig } from '../../../lib/companyConfigStore';

export const prerender = false;

export const GET: APIRoute = async () => {
  const stored = await getStoredCompanyConfig();
  const colors = resolveCompanyBrandColors(stored?.brandPrimary, stored?.brandSecondary);
  const storedPrimary = normalizeBrandColorHex(stored?.brandPrimary);
  const storedSecondary = normalizeBrandColorHex(stored?.brandSecondary);

  return jsonResponse(
    {
      ok: true,
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      primaryRgb: colors.primaryRgb,
      secondaryRgb: colors.secondaryRgb,
      gradient: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
      source: storedPrimary || storedSecondary ? 'company' : 'default',
      stored: {
        primary: storedPrimary,
        secondary: storedSecondary,
      },
      defaults: {
        primary: DEFAULT_SITE_BRAND_PRIMARY,
        secondary: DEFAULT_SITE_BRAND_SECONDARY,
      },
    },
    200,
    { cache: 'public, max-age=60' },
  );
};
