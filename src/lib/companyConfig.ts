/**
 * Resolved organization branding for pages, emails, and documents.
 * Values come from admin settings (Postgres / file), then env, then SITE defaults.
 */
import { SITE } from '../config/site';
import { requestOrigin, siteBaseUrl, siteOriginFallback } from './requestOrigin';
import { BRANDING_LOGO_PATH } from './companyLogo';
import { getStoredCompanyConfig, type StoredCompanyConfig } from './companyConfigStore';
import { serverEnv } from './serverEnv';

/** Sync cache — updated whenever getCompanyConfig resolves. */
let _cachedName: string = SITE.name;
let _cachedDomain = '';

export type CompanyBrandContext = {
  name: string;
  description: string;
  domain: string;
  siteUrl: string;
  supportEmail: string;
  fromEmail: string;
  contactsLabel: string;
  botUserAgent: string;
  projectLabel: string;
  inboundEmailExample: string;
};

export function cachedCompanyBrandName(): string {
  return _cachedName;
}

export function cachedCompanyDomain(): string {
  return _cachedDomain;
}

export function defaultBrandContext(): CompanyBrandContext {
  return companyToBrandContext({
    name: SITE.name,
    description: SITE.description,
    domain: cachedCompanyDomain(),
    supportEmail: '',
    fromEmail: '',
  });
}

/** Fields companyToBrandContext actually reads — accepts a full CompanyConfig too. */
type CompanyBrandSource = Pick<
  CompanyConfig,
  'name' | 'description' | 'domain' | 'supportEmail' | 'fromEmail'
>;

export function companyToBrandContext(company: CompanyBrandSource, request?: Request): CompanyBrandContext {
  const name = trim(company.name) || SITE.name;
  const domain = trim(company.domain);
  const siteUrl = domain
    ? `https://${domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/`
    : siteBaseUrl(request).replace(/\/?$/, '/');
  const fromEmail = trim(company.fromEmail);
  const supportEmail = trim(company.supportEmail);
  return {
    name,
    description: trim(company.description) || SITE.description,
    domain,
    siteUrl,
    supportEmail,
    fromEmail,
    contactsLabel: `${name} Contacts`,
    botUserAgent: `${name.replace(/\s+/g, '')}Bot/1.0`,
    projectLabel: `${name} App`,
    inboundEmailExample: fromEmail || (domain ? `inbox@mail.${domain}` : 'inbox@mail.example.com'),
  };
}

export async function getCompanyBrandContext(request?: Request): Promise<CompanyBrandContext> {
  const company = await getCompanyConfig(request);
  return companyToBrandContext(company, request);
}

export function defaultVapidSubjectFromCompany(company: CompanyConfig): string {
  if (company.supportEmail) return `mailto:${company.supportEmail}`;
  if (company.fromEmail) return `mailto:${company.fromEmail}`;
  if (company.domain) return `mailto:support@${company.domain}`;
  return 'mailto:noreply@localhost';
}

export type CompanyGeo = {
  lat: number;
  lng: number;
  placeId?: string;
  geocodedAt?: string;
};

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
  /** Tap-to-call / text number shown on client portals. */
  supportPhone: string;
  /** Default outbound From address (local part + domain). */
  fromEmail: string;
  /** Office / business street address (maps, directions, meeting defaults). */
  address: string;
  geo?: CompanyGeo;
  /** Root-relative or absolute logo URL; empty = hidden. */
  logoPath: string;
  /** Where logoPath came from — drives homepage hero behavior. */
  logoSource: 'admin' | 'default' | 'hidden';
  /** Bust browser cache after admin logo changes. */
  logoVersion: string;
  /** Vapi assistant UUID — admin setting, env fallback. */
  vapiAssistantId: string;
  /** Spoken greeting template (supports {{companyName}}). */
  vapiFirstMessage: string;
  /** System prompt synced to Vapi (supports {{companyName}}, etc.). */
  vapiSystemPrompt: string;
  socialTwitter: string;
  socialInstagram: string;
  socialLinkedin: string;
  socialFacebook: string;
  socialYoutube: string;
  socialTiktok: string;
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

function resolveLogo(stored: StoredCompanyConfig | null): Pick<CompanyConfig, 'logoPath' | 'logoSource' | 'logoVersion'> {
  const version = trim(stored?.updatedAt) || '';
  if (stored?.logoData && stored?.logoMediaType) {
    return { logoPath: BRANDING_LOGO_PATH, logoSource: 'admin', logoVersion: version };
  }
  const storedLogo = stored?.logoPath;
  if (storedLogo === '') {
    return { logoPath: '', logoSource: 'hidden', logoVersion: version };
  }
  if (storedLogo) {
    return { logoPath: storedLogo, logoSource: 'admin', logoVersion: version };
  }
  return {
    logoPath: pick(serverEnv('COMPANY_LOGO_PATH'), SITE.logoPath),
    logoSource: 'default',
    logoVersion: version,
  };
}

/** Cache-safe logo URL for img/mask tags. */
export function companyLogoUrl(path: string, version?: string | null): string {
  const p = trim(path);
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const v = trim(version);
  if (!v) return p.startsWith('/') ? p : `/${p}`;
  const base = p.startsWith('/') ? p : `/${p}`;
  return `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}`;
}

/** Homepage quantum mask — custom admin logo, default silhouette, or hidden. */
export function homepageHeroMask(company: CompanyConfig): string | null {
  if (company.logoSource === 'hidden') return null;
  if (company.logoSource === 'admin') {
    return companyLogoUrl(company.logoPath, company.logoVersion);
  }
  return '/logo-mask.svg';
}

/** Static logo image for the quantum intro resolve (default /logo.png). */
export function homepageHeroLogo(company: CompanyConfig): string | null {
  if (company.logoSource === 'hidden') return null;
  return companyLogoUrl(company.logoPath, company.logoVersion) || '/logo.png';
}

function resolveCompanyGeo(stored: StoredCompanyConfig | null): CompanyGeo | undefined {
  const geo = stored?.geo;
  if (!geo || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) return undefined;
  return {
    lat: geo.lat,
    lng: geo.lng,
    placeId: trim(geo.placeId) || undefined,
    geocodedAt: trim(geo.geocodedAt) || undefined,
  };
}

function resolveFromStored(stored: StoredCompanyConfig | null, request?: Request): CompanyConfig {
  const domain = domainFromEnvOrRequest(request);
  const logo = resolveLogo(stored);

  const name = pick(stored?.name, serverEnv('COMPANY_NAME'), SITE.name);
  const legalName = pick(stored?.legalName, serverEnv('COMPANY_LEGAL_NAME'), name);
  const description = pick(stored?.description, serverEnv('COMPANY_DESCRIPTION'), SITE.description);
  const supportEmail = pick(
    stored?.supportEmail,
    serverEnv('COMPANY_SUPPORT_EMAIL'),
    domain ? `support@${domain}` : '',
  );
  const supportPhone = pick(
    stored?.supportPhone,
    serverEnv('COMPANY_SUPPORT_PHONE'),
    serverEnv('TWILIO_FROM_NUMBER'),
  );
  const fromEmail = pick(
    stored?.fromEmail,
    serverEnv('COMPANY_FROM_EMAIL'),
    domain ? `noreply@${domain}` : '',
  );
  const address = pick(stored?.address, serverEnv('BOOKING_DEFAULT_ADDRESS'));
  const geo = resolveCompanyGeo(stored);
  const vapiAssistantId = pick(
    stored?.vapiAssistantId,
    serverEnv('VAPI_ASSISTANT_ID'),
    serverEnv('PUBLIC_VAPI_ASSISTANT_ID'),
  );

  const config = {
    name,
    legalName,
    description,
    domain,
    supportEmail,
    supportPhone,
    fromEmail,
    address,
    geo,
    vapiAssistantId,
    vapiFirstMessage: stored?.vapiFirstMessage?.trim() || '',
    vapiSystemPrompt: stored?.vapiSystemPrompt?.trim() || '',
    socialTwitter: trim(stored?.socialTwitter),
    socialInstagram: trim(stored?.socialInstagram),
    socialLinkedin: trim(stored?.socialLinkedin),
    socialFacebook: trim(stored?.socialFacebook),
    socialYoutube: trim(stored?.socialYoutube),
    socialTiktok: trim(stored?.socialTiktok),
    ...logo,
  };
  _cachedName = name;
  _cachedDomain = domain;
  return config;
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
  supportEmail?: string;
  supportPhone?: string;
  fromEmail?: string;
  address?: string;
  geo?: CompanyGeo | null;
  vapiAssistantId?: string;
  vapiFirstMessage?: string;
  vapiSystemPrompt?: string;
  socialTwitter?: string;
  socialInstagram?: string;
  socialLinkedin?: string;
  socialFacebook?: string;
  socialYoutube?: string;
  socialTiktok?: string;
};

export function normalizeCompanyInput(input: CompanyConfigInput): StoredCompanyConfig {
  const out: StoredCompanyConfig = {};
  if (input.name !== undefined) out.name = trim(input.name) || null;
  if (input.legalName !== undefined) out.legalName = trim(input.legalName) || null;
  if (input.description !== undefined) out.description = trim(input.description) || null;
  if (input.supportEmail !== undefined) out.supportEmail = trim(input.supportEmail) || null;
  if (input.supportPhone !== undefined) out.supportPhone = trim(input.supportPhone) || null;
  if (input.fromEmail !== undefined) out.fromEmail = trim(input.fromEmail) || null;
  if (input.address !== undefined) out.address = trim(input.address) || null;
  if (input.vapiAssistantId !== undefined) out.vapiAssistantId = trim(input.vapiAssistantId) || null;
  if (input.vapiFirstMessage !== undefined) {
    out.vapiFirstMessage = input.vapiFirstMessage.trim() ? input.vapiFirstMessage : null;
  }
  if (input.vapiSystemPrompt !== undefined) {
    out.vapiSystemPrompt = input.vapiSystemPrompt.trim() ? input.vapiSystemPrompt : null;
  }
  if (input.socialTwitter !== undefined) out.socialTwitter = trim(input.socialTwitter) || null;
  if (input.socialInstagram !== undefined) out.socialInstagram = trim(input.socialInstagram) || null;
  if (input.socialLinkedin !== undefined) out.socialLinkedin = trim(input.socialLinkedin) || null;
  if (input.socialFacebook !== undefined) out.socialFacebook = trim(input.socialFacebook) || null;
  if (input.socialYoutube !== undefined) out.socialYoutube = trim(input.socialYoutube) || null;
  if (input.socialTiktok !== undefined) out.socialTiktok = trim(input.socialTiktok) || null;
  return out;
}

/** Resolve geocoordinates when saving a company address. */
export async function resolveCompanyAddressGeo(
  addressInput: string | undefined | null,
  geoInput: CompanyGeo | null | undefined,
  previousAddress?: string | null,
): Promise<StoredCompanyConfig['geo']> {
  const address = trim(addressInput);
  if (!address) return null;

  const prev = trim(previousAddress);
  const coordsMissing =
    !geoInput || !Number.isFinite(geoInput.lat) || !Number.isFinite(geoInput.lng);
  const addressChanged = address !== prev;

  if (!coordsMissing && !addressChanged) {
    return {
      lat: geoInput.lat,
      lng: geoInput.lng,
      placeId: geoInput.placeId || null,
      geocodedAt: geoInput.geocodedAt || new Date().toISOString(),
    };
  }

  const { resolveAddressCoordinates } = await import('./mapbox');
  const geocoded = await resolveAddressCoordinates(address);
  if (!geocoded) return coordsMissing ? null : {
    lat: geoInput!.lat,
    lng: geoInput!.lng,
    placeId: geoInput!.placeId || null,
    geocodedAt: geoInput!.geocodedAt || null,
  };

  return {
    lat: geocoded.lat,
    lng: geocoded.lng,
    placeId: geocoded.placeId || null,
    geocodedAt: geocoded.geocodedAt || new Date().toISOString(),
  };
}
