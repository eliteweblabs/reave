/**
 * Resolved organization branding for pages, emails, and documents.
 * Values come from admin settings (Postgres / file), then env, then SITE defaults.
 */
import { SITE } from '../config/site';
import { requestOrigin, siteOriginFallback } from './requestOrigin';
import { getStoredCompanyConfig, type StoredCompanyConfig } from './companyConfigStore';
import { serverEnv } from './serverEnv';

export type CompanyConfig = {
  /** Display name (titles, emails, "Powered by …"). */
  name: string;
  /** Legal entity name for contracts; defaults to name. */
  legalName: string;
  /** Default meta description. */
  description: string;
  /** Hostname only, e.g. example.com */
  domain: string;
  supportEmail: string;
  /** Default outbound From address (local part + domain). */
  fromEmail: string;
  /** Root-relative logo path, e.g. /logo.png */
  logoPath: string;
};

function trim(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function hostnameFromOrigin(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

function domainFromEnvOrRequest(request?: Request): string {
  const envDomain = trim(serverEnv('COMPANY_DOMAIN') || serverEnv('PUBLIC_SITE_DOMAIN'));
  if (envDomain) return envDomain.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0] ?? '';

  if (request) {
    const host = hostnameFromOrigin(requestOrigin(request));
    if (host && host !== 'localhost' && !host.startsWith('127.')) return host;
  }

  const fallback = hostnameFromOrigin(siteOriginFallback());
  if (fallback && fallback !== 'localhost' && !fallback.startsWith('127.')) return fallback;

  return '';
}

function pick(...values: (string | null | undefined)[]): string {
  for (const v of values) {
    const t = trim(v);
    if (t) return t;
  }
  return '';
}

function resolveFromStored(stored: StoredCompanyConfig | null, request?: Request): CompanyConfig {
  const domain = pick(stored?.domain, serverEnv('COMPANY_DOMAIN'), domainFromEnvOrRequest(request));

  const name = pick(stored?.name, serverEnv('COMPANY_NAME'), SITE.name);
  const legalName = pick(stored?.legalName, serverEnv('COMPANY_LEGAL_NAME'), name);
  const description = pick(stored?.description, serverEnv('COMPANY_DESCRIPTION'), SITE.description);
  const supportEmail = pick(
    stored?.supportEmail,
    serverEnv('COMPANY_SUPPORT_EMAIL'),
    domain ? `support@${domain}` : '',
  );
  const fromEmail = pick(
    stored?.fromEmail,
    serverEnv('COMPANY_FROM_EMAIL'),
    domain ? `noreply@${domain}` : '',
  );
  const logoPath = pick(stored?.logoPath, serverEnv('COMPANY_LOGO_PATH'), SITE.logoPath);

  return { name, legalName, description, domain, supportEmail, fromEmail, logoPath };
}

/** Full resolved branding for the current deployment. */
export async function getCompanyConfig(request?: Request): Promise<CompanyConfig> {
  const stored = await getStoredCompanyConfig();
  return resolveFromStored(stored, request);
}

/** Footer label — only "Powered by" is fixed; the name comes from settings. */
export function poweredByLabel(company: CompanyConfig): string {
  const name = trim(company.name);
  return name ? `Powered by ${name}` : 'Powered by';
}

/** Default Resend From header unless RESEND_FROM is set. */
export async function resolveEmailFrom(): Promise<string> {
  const explicit = trim(serverEnv('RESEND_FROM'));
  if (explicit) return explicit;
  const company = await getCompanyConfig();
  if (company.name && company.fromEmail) return `${company.name} <${company.fromEmail}>`;
  if (company.fromEmail) return company.fromEmail;
  return '';
}

export type CompanyConfigInput = {
  name?: string;
  legalName?: string;
  description?: string;
  domain?: string;
  supportEmail?: string;
  fromEmail?: string;
  logoPath?: string;
};

export function normalizeCompanyInput(input: CompanyConfigInput): StoredCompanyConfig {
  return {
    name: trim(input.name) || null,
    legalName: trim(input.legalName) || null,
    description: trim(input.description) || null,
    domain: trim(input.domain).replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0] || null,
    supportEmail: trim(input.supportEmail) || null,
    fromEmail: trim(input.fromEmail) || null,
    logoPath: trim(input.logoPath) || null,
  };
}
