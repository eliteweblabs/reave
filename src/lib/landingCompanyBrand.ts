/**
 * Public landing pages — admin Company settings override static site JSON.
 */
import { brandFontCssVars } from './brandFonts';
import {
  companyLogoUrl,
  type CompanyConfig,
} from './companyConfig';
import { normalizeBrandColorHex, resolveCompanyBrandColors } from './companyBrandColors';

export function landingWordmarkSrc(company: CompanyConfig, landingHeroLogo?: string | null): string {
  if (company.logoSource === 'admin' && company.logoPath) {
    const adminUrl = companyLogoUrl(company.logoPath, company.logoVersion);
    if (adminUrl && (company.logoHasRaster || company.logoSvg?.trim())) return adminUrl;
  }
  const fromJson = (landingHeroLogo || '').trim();
  if (fromJson) return fromJson;
  if (company.logoSource !== 'hidden' && company.logoPath) {
    return companyLogoUrl(company.logoPath, company.logoVersion);
  }
  return '';
}

export function landingBrandName(company: CompanyConfig, landingName?: string | null): string {
  return (company.name || '').trim() || (landingName || '').trim() || 'Book';
}

export function landingThemeColor(
  company: CompanyConfig,
  landingTheme?: string | null,
  fallback?: string,
): string {
  return (
    normalizeBrandColorHex(company.brandPrimary) ||
    normalizeBrandColorHex(landingTheme) ||
    normalizeBrandColorHex(company.iconBackground) ||
    fallback ||
    '#1a2e1f'
  );
}

/** Map admin brand colors onto pack landing CSS tokens. */
export function packBrandCssVarsInline(company: CompanyConfig): string {
  const { primary, secondary } = resolveCompanyBrandColors(company.brandPrimary, company.brandSecondary);
  return [
    `--pack-gold: ${primary}`,
    `--pack-gold-light: ${primary}`,
    `--pack-orange: ${secondary}`,
    `--pack-ember: ${secondary}`,
    `--pack-brick: ${secondary}`,
    `--brand-primary: ${primary}`,
    `--brand-secondary: ${secondary}`,
  ].join('; ');
}

export function packHtmlStyleAttr(company: CompanyConfig): string {
  return [brandFontCssVars(company.fonts), packBrandCssVarsInline(company)].filter(Boolean).join('; ');
}
