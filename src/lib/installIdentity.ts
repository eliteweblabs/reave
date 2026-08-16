/**
 * Install identity published by the REΛVE Railway node.
 *
 * Siblings (Cal.com, Crater, …) should reference these values — do not re-type
 * icon, username, or email on each new service. Runtime resolution reads
 * company config + env; the deploy wizard writes the same fields as Railway
 * variables on `reave` so `${{ reave.VAR }}` works at deploy time.
 */
import { BRANDING_ICON_PATH } from './companyLogo';
import {
  cachedCompanyBrandName,
  cachedCompanyDomain,
  getCompanyConfig,
  type CompanyConfig,
} from './companyConfig';
import { installConfigSlug } from './installConfig';
import {
  parseEmailAddress,
  slugifyCalcomUsername,
} from './installIdentityFormat';
import { siteBaseUrl } from './requestOrigin';
import { serverEnv } from './serverEnv';

export type InstallIdentity = {
  name: string;
  username: string;
  email: string;
  iconUrl: string;
};

export { parseEmailAddress, slugifyCalcomUsername } from './installIdentityFormat';

export function resolveCalcomUsernameSync(): string {
  const configured = serverEnv('CALCOM_USERNAME')?.trim();
  if (configured) return configured;

  const install = serverEnv('INSTALL_CONFIG')?.trim();
  if (install && install !== 'demo' && install !== 'default') {
    const slug = slugifyCalcomUsername(install);
    if (slug) return slug;
  }

  const domain =
    serverEnv('COMPANY_DOMAIN')?.trim() ||
    serverEnv('PUBLIC_SITE_DOMAIN')?.trim() ||
    cachedCompanyDomain();
  const fromDomain = slugifyCalcomUsername(domain);
  if (fromDomain) return fromDomain;

  return slugifyCalcomUsername(cachedCompanyBrandName()) || slugifyCalcomUsername(installConfigSlug()) || 'bookings';
}

function publicOrigin(request?: Request): string {
  const siteUrl = serverEnv('PUBLIC_SITE_URL')?.trim();
  if (siteUrl) return siteUrl.replace(/\/+$/, '');
  const domain = serverEnv('PUBLIC_SITE_DOMAIN')?.trim() || serverEnv('COMPANY_DOMAIN')?.trim();
  if (domain) {
    const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0] ?? '';
    if (host) return `https://${host}`;
  }
  return siteBaseUrl(request).replace(/\/+$/, '');
}

export function resolveInstallIconUrl(request?: Request, company?: Pick<CompanyConfig, 'iconVersion'>): string {
  const configured = serverEnv('COMPANY_ICON_URL')?.trim();
  if (configured) return configured;
  const origin = publicOrigin(request);
  const version = company?.iconVersion?.trim();
  const params = new URLSearchParams({ size: '192' });
  if (version) params.set('v', version);
  return `${origin}${BRANDING_ICON_PATH}?${params.toString()}`;
}

function resolveEmail(company?: Pick<CompanyConfig, 'fromEmail' | 'supportEmail'>): string {
  return (
    parseEmailAddress(serverEnv('EMAIL_FROM')) ||
    parseEmailAddress(serverEnv('RESEND_FROM')) ||
    parseEmailAddress(company?.fromEmail) ||
    parseEmailAddress(company?.supportEmail) ||
    parseEmailAddress(serverEnv('COMPANY_FROM_EMAIL')) ||
    parseEmailAddress(serverEnv('COMPANY_SUPPORT_EMAIL'))
  );
}

function resolveName(company?: Pick<CompanyConfig, 'name'>): string {
  return (
    serverEnv('EMAIL_FROM_NAME')?.trim() ||
    company?.name?.trim() ||
    serverEnv('COMPANY_NAME')?.trim() ||
    cachedCompanyBrandName()
  );
}

export async function resolveInstallIdentity(request?: Request): Promise<InstallIdentity> {
  const company = await getCompanyConfig(request);
  return {
    name: resolveName(company),
    username: resolveCalcomUsernameSync() || slugifyCalcomUsername(company.name) || 'bookings',
    email: resolveEmail(company),
    iconUrl: resolveInstallIconUrl(request, company),
  };
}
