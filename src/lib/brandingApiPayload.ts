/**
 * JSON branding payload for Crater + integrations.
 * Logo bytes are served from admin company_config via /api/branding/logo — not /branding/* disk files.
 */
import type { APIContext } from 'astro';
import {
  DEFAULT_SITE_BRAND_PRIMARY,
  DEFAULT_SITE_BRAND_SECONDARY,
  normalizeBrandColorHex,
  resolveCompanyBrandColors,
} from './companyBrandColors';
import { companyBrandingVersion, getCompanyConfig, type CompanyConfig } from './companyConfig';
import { BRANDING_LOGO_ALT_PATH, BRANDING_LOGO_API_PATH } from './companyLogo';
import { getStoredCompanyConfig } from './companyConfigStore';
import { siteBaseUrl } from './contactApi';

export type BrandingApiPayload = {
  ok: true;
  name: string;
  logoSource: CompanyConfig['logoSource'];
  /** Absolute PNG URL for white email headers; null when admin wordmark is hidden or unset. */
  logoEmailUrl: string | null;
  /** Absolute PNG URL for dark UI chrome (Galene sidebar, dark nav); null when unset. */
  logoDarkUrl: string | null;
  /** Company display name for integrations (not deployment owner PII). */
  contactName: string | null;
  /** Public company support/from email — never the owner's personal address. */
  contactEmail: string | null;
  primary: string;
  secondary: string;
  accent: string;
  primaryRgb: string;
  secondaryRgb: string;
  gradient: string;
  source: 'company' | 'default';
  stored: {
    primary: string | null;
    secondary: string | null;
  };
  defaults: {
    primary: string;
    secondary: string;
  };
};

function brandingWordmarkAvailable(company: CompanyConfig): boolean {
  if (company.logoSource === 'hidden') return false;
  return (
    company.logoSource === 'admin' &&
    (company.logoHasRaster || Boolean(company.logoSvg?.trim()))
  );
}

export function brandingLogoEmailUrl(company: CompanyConfig, base: string): string | null {
  if (!brandingWordmarkAvailable(company)) return null;

  const origin = base.replace(/\/+$/, '');
  const params = new URLSearchParams({ email: '1' });
  const version = companyBrandingVersion(company);
  if (version) params.set('v', version);

  return `${origin}${BRANDING_LOGO_API_PATH}?${params.toString()}`;
}

/** Light ink on transparent — for dark backgrounds (Galene, purple nav). */
export function brandingLogoDarkUrl(company: CompanyConfig, base: string): string | null {
  if (!brandingWordmarkAvailable(company)) return null;

  const origin = base.replace(/\/+$/, '');
  const params = new URLSearchParams();
  const version = companyBrandingVersion(company);
  if (version) params.set('v', version);

  const qs = params.toString();
  return `${origin}${BRANDING_LOGO_ALT_PATH}${qs ? `?${qs}` : ''}`;
}

export async function buildBrandingApiPayload(context: APIContext): Promise<BrandingApiPayload> {
  const stored = await getStoredCompanyConfig();
  const company = await getCompanyConfig(context.request);
  const base = siteBaseUrl(context.request);
  const colors = resolveCompanyBrandColors(stored?.brandPrimary, stored?.brandSecondary);
  const storedPrimary = normalizeBrandColorHex(stored?.brandPrimary);
  const storedSecondary = normalizeBrandColorHex(stored?.brandSecondary);
  const contactName = company.name?.trim() || null;
  const contactEmail = company.supportEmail?.trim() || company.fromEmail?.trim() || null;

  return {
    ok: true,
    name: company.name,
    logoSource: company.logoSource,
    logoEmailUrl: brandingLogoEmailUrl(company, base),
    logoDarkUrl: brandingLogoDarkUrl(company, base),
    contactName,
    contactEmail,
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
  };
}
