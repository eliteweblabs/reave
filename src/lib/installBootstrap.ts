/**
 * First-boot company bootstrap from deploy-wizard Railway variables.
 * Runs before sample-data seeding so address, branding, and contact info
 * land even when inbox / calendar / knowledge seeds are off.
 */
import { normalizeBrandColorHex } from './companyBrandColors';
import type { CompanyConfigInput } from './companyConfig';
import { normalizeCompanyInput, resolveCompanyAddressGeo } from './companyConfig';
import { getStoredCompanyConfig, setStoredCompanyConfig } from './companyConfigStore';
import { serverEnv } from './serverEnv';

function envOn(name: string): boolean {
  const raw = serverEnv(name)?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function envTrim(name: string, max = 500): string {
  return (serverEnv(name) ?? '').trim().slice(0, max);
}

export function shouldInstallBootstrap(): boolean {
  if (envOn('INSTALL_BOOTSTRAP')) return true;
  return Boolean(
    envTrim('COMPANY_NAME') ||
      envTrim('BOOKING_DEFAULT_ADDRESS') ||
      envTrim('COMPANY_ADDRESS') ||
      envTrim('COMPANY_SUPPORT_EMAIL') ||
      envTrim('COMPANY_SUPPORT_PHONE') ||
      envTrim('COMPANY_DESCRIPTION') ||
      envTrim('COMPANY_BRAND_PRIMARY') ||
      envTrim('COMPANY_BRAND_SECONDARY') ||
      envTrim('COMPANY_LOGO_URL') ||
      envTrim('INSTALL_LOGO_DATA'),
  );
}

function decodeInstallLogo(): { dataBase64: string; mediaType: string } | null {
  const data = envTrim('INSTALL_LOGO_DATA', 32_000);
  const mediaType = envTrim('INSTALL_LOGO_MEDIA_TYPE', 80) || 'image/png';
  if (!data || data.length > 24_000) return null;
  if (!/^image\/(png|jpeg|jpg|webp|gif|svg\+xml)$/i.test(mediaType)) return null;
  return { dataBase64: data, mediaType };
}

let running: Promise<{ ok: boolean; detail: string; skipped?: boolean }> | null = null;

export async function ensureInstallBootstrap(): Promise<{ ok: boolean; detail: string; skipped?: boolean }> {
  if (!shouldInstallBootstrap()) {
    return { ok: true, skipped: true, detail: 'Install bootstrap env not set' };
  }
  if (running) return running;

  running = (async () => {
    const existing = await getStoredCompanyConfig();
    const patch: CompanyConfigInput = {};

    const name = envTrim('COMPANY_NAME', 120);
    if (name && !existing?.name?.trim()) patch.name = name;

    const description = envTrim('COMPANY_DESCRIPTION', 240);
    if (description && !existing?.description?.trim()) patch.description = description;

    const domain =
      envTrim('COMPANY_DOMAIN', 120) ||
      envTrim('PUBLIC_SITE_DOMAIN', 120).replace(/^www\./, '');
    if (domain && !existing?.domain?.trim()) patch.domain = domain;

    const supportEmail = envTrim('COMPANY_SUPPORT_EMAIL', 254);
    if (supportEmail && !existing?.supportEmail?.trim()) patch.supportEmail = supportEmail;

    const supportPhone = envTrim('COMPANY_SUPPORT_PHONE', 40);
    if (supportPhone && !existing?.supportPhone?.trim()) patch.supportPhone = supportPhone;

    const address = envTrim('BOOKING_DEFAULT_ADDRESS', 200) || envTrim('COMPANY_ADDRESS', 200);
    if (address && !existing?.address?.trim()) {
      patch.address = address;
      patch.geo = await resolveCompanyAddressGeo(address, null, existing?.address);
    }

    const brandPrimary = normalizeBrandColorHex(envTrim('COMPANY_BRAND_PRIMARY', 16));
    if (brandPrimary && !existing?.brandPrimary?.trim()) patch.brandPrimary = brandPrimary;

    const brandSecondary = normalizeBrandColorHex(envTrim('COMPANY_BRAND_SECONDARY', 16));
    if (brandSecondary && !existing?.brandSecondary?.trim()) patch.brandSecondary = brandSecondary;

    const logoUrl = envTrim('COMPANY_LOGO_URL', 500);
    if (logoUrl && !existing?.logoPath?.trim() && !existing?.logoData?.trim()) {
      patch.logoPath = logoUrl;
    }

    const installLogo = decodeInstallLogo();
    if (installLogo && !existing?.logoData?.trim()) {
      patch.logoData = installLogo.dataBase64;
      patch.logoMediaType = installLogo.mediaType;
    }

    const touched = Object.keys(patch).length > 0;
    if (!touched) {
      return { ok: true, skipped: true, detail: 'Company config already populated' };
    }

    const ok = await setStoredCompanyConfig(normalizeCompanyInput(patch));
    if (!ok) return { ok: false, detail: 'Failed to write company bootstrap' };
    return { ok: true, detail: 'Applied install bootstrap to company config' };
  })();

  try {
    return await running;
  } finally {
    running = null;
  }
}
