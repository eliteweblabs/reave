/**
 * Resolved organization branding for pages, emails, and documents.
 * Values come from admin settings (Postgres / file), then env, then SITE defaults.
 */
import { SITE } from '../config/site';
import { requestOrigin, siteBaseUrl, siteOriginFallback } from './requestOrigin';
import {
  BRANDING_LOGO_PATH,
  BRANDING_ICON_PATH,
  BRANDING_OG_PATH,
  normalizePublicLogoPath,
} from './companyLogo';
import { prepareInlineBrandSvg } from './brandSvg';
import { BRAND_ICON_SIZES } from './brandIconRaster';
import {
  getStoredCompanyConfig,
  setStoredCompanyConfig,
  type StoredCompanyConfig,
} from './companyConfigStore';

import { DEFAULT_PORTAL_OUTREACH_NOTICE } from './portalOutreachNotice';
export { DEFAULT_PORTAL_OUTREACH_NOTICE };
import { normalizeBrandFontInput, resolveBrandFonts, type ResolvedBrandFonts } from './brandFonts';
import { normalizeBrandColorHex, resolveCompanyBrandColors } from './companyBrandColors';
import { isCanonicalReaveInstall } from './installConfig';
import { serverEnv } from './serverEnv';
import { parseHiddenSocialPlatforms } from './social/platforms.ts';
import { getPostAlias, type PostAliasLabels } from './postAlias.ts';
import { inboundMailboxExample } from './inboundEmailInstall';
import {
  canonicalizeReaveBrandEmail,
  defaultPublicEmailForDomain,
  officialReavePublicEmailPatch,
} from './reavePublicEmail';

/**
 * Make a string safe to use as an HTTP header value. `fetch` requires header
 * values to be ISO-8859-1 (Latin1); any code point above U+00FF throws
 * "Cannot convert argument to a ByteString". Brand names may contain stylized
 * non-ASCII glyphs (e.g. "λ"), so strip anything outside printable ASCII before
 * building User-Agent strings and similar headers from them.
 */
export function headerSafe(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();
}

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
  /** User-facing singular/plural labels for work records (POST_ALIAS env). */
  postAlias: PostAliasLabels;
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
  const fromEmail = canonicalizeReaveBrandEmail(trim(company.fromEmail));
  const supportEmail = canonicalizeReaveBrandEmail(trim(company.supportEmail));
  const headerSafeName = headerSafe(name).replace(/\s+/g, '') || 'App';
  return {
    name,
    description: trim(company.description) || SITE.description,
    domain,
    siteUrl,
    supportEmail,
    fromEmail,
    contactsLabel: `${name} Contacts`,
    botUserAgent: `${headerSafeName}Bot/1.0`,
    projectLabel: `${name} App`,
    postAlias: getPostAlias(),
    inboundEmailExample: inboundMailboxExample(domain),
  };
}

export async function getCompanyBrandContext(request?: Request): Promise<CompanyBrandContext> {
  const company = await getCompanyConfig(request);
  return companyToBrandContext(company, request);
}

export function defaultVapidSubjectFromCompany(company: CompanyConfig): string {
  const support = canonicalizeReaveBrandEmail(company.supportEmail);
  if (support) return `mailto:${support}`;
  const from = canonicalizeReaveBrandEmail(company.fromEmail);
  if (from) return `mailto:${from}`;
  const domainFallback = defaultPublicEmailForDomain(company.domain, 'support');
  if (domainFallback) return `mailto:${domainFallback}`;
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
  /** Hostname only, e.g. example.com — from PUBLIC_SITE_DOMAIN / COMPANY_DOMAIN. */
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
  /** Square brand icon — favicons, PWA, staff comment avatars. */
  iconPath: string;
  /** Where iconPath came from. `logo` means favicons/avatars reuse the logo. */
  iconSource: 'admin' | 'default' | 'logo';
  /** Bust browser cache after admin icon changes. */
  iconVersion: string;
  /** Inline SVG for header wordmark (admin paste; wins over the uploaded image). */
  logoSvg: string;
  /** Inline SVG for homepage hero icon (admin paste; wins over the uploaded image). */
  iconSvg: string;
  /** True when an admin-uploaded raster (PNG/JPEG/WebP) is stored for the logo. */
  logoHasRaster: boolean;
  /** True when an admin-uploaded raster (PNG/JPEG/WebP) is stored for the icon. */
  iconHasRaster: boolean;
  /** True when an admin-uploaded default social-share (OG) image is stored. */
  ogHasRaster: boolean;
  /** Vapi assistant UUID — admin setting, env fallback. */
  vapiAssistantId: string;
  /** Spoken greeting template (supports {{companyName}}). */
  vapiFirstMessage: string;
  /** System prompt synced to Vapi (supports {{companyName}}, etc.). */
  vapiSystemPrompt: string;
  /** Auto-open outreach note on client portal pages; empty = hidden. */
  portalOutreachNotice: string;
  socialTwitter: string;
  socialInstagram: string;
  socialLinkedin: string;
  socialFacebook: string;
  socialYoutube: string;
  socialTiktok: string;
  socialBluesky: string;
  socialThreads: string;
  socialPinterest: string;
  socialSnapchat: string;
  socialDiscord: string;
  socialReddit: string;
  socialGithub: string;
  socialTwitch: string;
  socialTelegram: string;
  socialWhatsapp: string;
  socialSubstack: string;
  socialYelp: string;
  socialGoogleBusiness: string;
  /** Platform ids hidden from the Socials settings form. */
  socialHiddenPlatforms: string[];
  /** Resolved typography from admin Company branding. */
  fonts: ResolvedBrandFonts;
  /** Admin-selected primary brand color (hex), empty = site default. */
  brandPrimary: string;
  /** Admin-selected secondary brand color (hex), empty = site default. */
  brandSecondary: string;
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

function normalizeDomain(raw: string | null | undefined): string {
  const t = trim(raw);
  if (!t) return '';
  return t.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0]?.split(':')[0] ?? '';
}

function domainFromEnv(): string {
  return normalizeDomain(
    serverEnv('COMPANY_DOMAIN') || serverEnv('PUBLIC_SITE_DOMAIN') || serverEnv('PUBLIC_SITE_URL'),
  );
}

function domainFromRequest(request?: Request): string {
  if (request) {
    const host = hostnameFromOrigin(requestOrigin(request));
    if (host && host !== 'localhost' && !host.startsWith('127.')) return host;
  }

  const fallback = hostnameFromOrigin(siteOriginFallback());
  if (fallback && fallback !== 'localhost' && !fallback.startsWith('127.')) return fallback;

  return '';
}

/** Railway / env first — stored admin value is last-resort only (cannot override the deploy). */
function resolveCompanyDomain(stored: StoredCompanyConfig | null, request?: Request): string {
  return pick(domainFromEnv(), domainFromRequest(request), stored?.domain);
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
  // Stale row: API path without binary data (e.g. PNG cleared but path left behind).
  if (storedLogo && storedLogo !== BRANDING_LOGO_PATH) {
    return {
      logoPath: normalizePublicLogoPath(storedLogo),
      logoSource: 'admin',
      logoVersion: version,
    };
  }
  return {
    logoPath: pick(serverEnv('COMPANY_LOGO_PATH'), SITE.logoPath),
    logoSource: 'default',
    logoVersion: version,
  };
}

function resolveIcon(stored: StoredCompanyConfig | null): Pick<CompanyConfig, 'iconPath' | 'iconSource' | 'iconVersion'> {
  const version = trim(stored?.updatedAt) || '';
  if (stored?.iconData && stored?.iconMediaType) {
    return { iconPath: BRANDING_ICON_PATH, iconSource: 'admin', iconVersion: version };
  }
  if (trim(stored?.iconSvg)) {
    return { iconPath: BRANDING_ICON_PATH, iconSource: 'admin', iconVersion: version };
  }
  const storedIcon = trim(stored?.iconPath);
  // Stale row: API path without binary data — fall back to SVG rasterization / site default.
  if (storedIcon && storedIcon !== BRANDING_ICON_PATH) {
    return { iconPath: storedIcon, iconSource: 'admin', iconVersion: version };
  }
  if ((stored?.logoData && stored?.logoMediaType) || trim(stored?.logoSvg)) {
    return { iconPath: BRANDING_ICON_PATH, iconSource: 'logo', iconVersion: version };
  }
  return {
    iconPath: pick(serverEnv('COMPANY_ICON_PATH'), SITE.favicons.png192),
    iconSource: 'default',
    iconVersion: version,
  };
}

/** Cache-safe logo URL for img/mask tags. */
export function companyLogoUrl(path: string, version?: string | null): string {
  const p = normalizePublicLogoPath(trim(path));
  if (!p) return '';
  if (/^https?:\/\//i.test(p)) return p;
  const v = trim(version);
  if (!v) return p.startsWith('/') ? p : `/${p}`;
  const base = p.startsWith('/') ? p : `/${p}`;
  return `${base}${base.includes('?') ? '&' : '?'}v=${encodeURIComponent(v)}`;
}

/** Cache-bust query for branding API routes after admin saves. */
export function companyBrandingVersion(company: CompanyConfig): string | null {
  const v = trim(company.iconVersion) || trim(company.logoVersion);
  return v || null;
}

/** Build a sized branding icon URL (admin PNG/SVG rasterized at request time). */
export function brandIconUrl(size: number, version?: string | null, opts?: { transparent?: boolean }): string {
  const params = new URLSearchParams({ size: String(size) });
  const v = trim(version);
  if (v) params.set('v', v);
  if (opts?.transparent) params.set('transparent', '1');
  return `${BRANDING_ICON_PATH}?${params.toString()}`;
}

export type CompanyFaviconUrls = {
  ico: string;
  png32: string;
  png16: string;
  appleTouchIcon: string;
  png192: string;
  png512: string;
};

function versionedRootIcon(path: string, version?: string | null): string {
  const v = trim(version);
  return v ? `${path}?v=${encodeURIComponent(v)}` : path;
}

/** Resolved favicon / PWA icon URLs — rasterized from admin branding at request time. */
export function companyFaviconUrls(company: CompanyConfig): CompanyFaviconUrls {
  const version = companyBrandingVersion(company);
  return {
    ico: versionedRootIcon(SITE.favicons.ico, version),
    png32: brandIconUrl(BRAND_ICON_SIZES.png32, version),
    png16: brandIconUrl(BRAND_ICON_SIZES.png16, version),
    appleTouchIcon: versionedRootIcon(SITE.favicons.appleTouchIcon, version),
    png192: brandIconUrl(BRAND_ICON_SIZES.png192, version),
    png512: brandIconUrl(BRAND_ICON_SIZES.png512, version),
  };
}

/** Runtime OG / Twitter card — uploaded share image, else generated from logo/icon. */
export function companyOgImageUrl(company: CompanyConfig): string {
  const version = companyBrandingVersion(company);
  if (!version) return BRANDING_OG_PATH;
  return `${BRANDING_OG_PATH}?v=${encodeURIComponent(version)}`;
}

/** Pasted SVG that sanitizes cleanly enough to inline on the header or hero. */
export function companyUsableInlineSvg(raw?: string | null): string {
  const svg = trim(raw);
  if (!svg) return '';
  return prepareInlineBrandSvg(svg) ? svg : '';
}

/** Inline SVG for the homepage hero — pasted icon SVG only. */
export function companyHeroIconSvg(company: CompanyConfig): string {
  return companyUsableInlineSvg(company.iconSvg);
}

/** Admin-uploaded header logo image (not inline SVG). */
export function hasCompanyHeaderLogoImage(company: CompanyConfig): boolean {
  return company.logoSource === 'admin' && Boolean(trim(company.logoPath));
}

/** Admin-uploaded square icon image (not the built-in default mark). */
export function hasCompanyIconImage(company: CompanyConfig): boolean {
  return company.iconSource === 'admin' && Boolean(trim(company.iconPath));
}

/** Raster fallback for the homepage hero when no pasted SVG is usable. */
export function companyHeroIconImageUrl(company: CompanyConfig): string {
  if (hasCompanyIconImage(company)) {
    return brandIconUrl(512, companyBrandingVersion(company));
  }
  if (hasCompanyHeaderLogoImage(company)) {
    return companyLogoUrl(company.logoPath, company.logoVersion);
  }
  return '';
}

/** Staff / team avatar — square mark from admin branding API. */
export function companyStaffAvatarUrl(company: CompanyConfig): string {
  return brandIconUrl(BRAND_ICON_SIZES.png192, companyBrandingVersion(company), { transparent: true });
}

/** Deck preloader quantum mask — custom admin logo, default silhouette, or hidden. */
export function deckQuantumHeroMask(company: CompanyConfig): string | null {
  if (company.logoSource === 'hidden') return null;
  if (company.logoSource === 'admin') {
    return companyLogoUrl(company.logoPath, company.logoVersion);
  }
  return '/reave-logo-mask.png';
}

/** Static logo image for the deck preloader intro resolve (default /reave-logo.png). */
export function deckQuantumHeroLogo(company: CompanyConfig): string | null {
  if (company.logoSource === 'hidden') return null;
  return companyLogoUrl(company.logoPath, company.logoVersion) || SITE.logoPath;
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

function resolvePortalOutreachNotice(stored: StoredCompanyConfig | null): string {
  if (stored?.portalOutreachNotice === '') return '';
  const custom = stored?.portalOutreachNotice?.trim();
  const officialDefault = DEFAULT_PORTAL_OUTREACH_NOTICE.trim();
  // Client clones must not inherit the official reΛVe.app welcome (code default or
  // a copy that landed in company_config). Empty = sheet hidden.
  if (!isCanonicalReaveInstall()) {
    if (!custom || custom === officialDefault) return '';
    return custom;
  }
  if (custom) return custom;
  return DEFAULT_PORTAL_OUTREACH_NOTICE;
}

function resolveFromStored(stored: StoredCompanyConfig | null, request?: Request): CompanyConfig {
  const domain = resolveCompanyDomain(stored, request);
  const logo = resolveLogo(stored);
  const icon = resolveIcon(stored);

  const name = pick(stored?.name, serverEnv('COMPANY_NAME'), SITE.name);
  const legalName = pick(stored?.legalName, serverEnv('COMPANY_LEGAL_NAME'), name);
  const description = pick(stored?.description, serverEnv('COMPANY_DESCRIPTION'), SITE.description);
  const supportEmail =
    canonicalizeReaveBrandEmail(
      pick(stored?.supportEmail, serverEnv('COMPANY_SUPPORT_EMAIL')),
    ) || defaultPublicEmailForDomain(domain, 'support');
  const supportPhone = pick(
    stored?.supportPhone,
    serverEnv('COMPANY_SUPPORT_PHONE'),
    serverEnv('TWILIO_FROM_NUMBER'),
  );
  const fromEmail =
    canonicalizeReaveBrandEmail(
      pick(stored?.fromEmail, serverEnv('COMPANY_FROM_EMAIL')),
    ) || (domain ? `noreply@${domain}` : '');
  const address = pick(stored?.address, serverEnv('BOOKING_DEFAULT_ADDRESS'));
  const geo = resolveCompanyGeo(stored);
  const fonts = resolveBrandFonts(stored);
  const brandColors = resolveCompanyBrandColors(stored?.brandPrimary, stored?.brandSecondary);
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
    portalOutreachNotice: resolvePortalOutreachNotice(stored),
    socialTwitter: trim(stored?.socialTwitter),
    socialInstagram: trim(stored?.socialInstagram),
    socialLinkedin: trim(stored?.socialLinkedin),
    socialFacebook: trim(stored?.socialFacebook),
    socialYoutube: trim(stored?.socialYoutube),
    socialTiktok: trim(stored?.socialTiktok),
    socialBluesky: trim(stored?.socialBluesky),
    socialThreads: trim(stored?.socialThreads),
    socialPinterest: trim(stored?.socialPinterest),
    socialSnapchat: trim(stored?.socialSnapchat),
    socialDiscord: trim(stored?.socialDiscord),
    socialReddit: trim(stored?.socialReddit),
    socialGithub: trim(stored?.socialGithub),
    socialTwitch: trim(stored?.socialTwitch),
    socialTelegram: trim(stored?.socialTelegram),
    socialWhatsapp: trim(stored?.socialWhatsapp),
    socialSubstack: trim(stored?.socialSubstack),
    socialYelp: trim(stored?.socialYelp),
    socialGoogleBusiness: trim(stored?.socialGoogleBusiness),
    socialHiddenPlatforms: parseHiddenSocialPlatforms(stored?.socialHiddenPlatforms),
    fonts,
    brandPrimary: brandColors.primary,
    brandSecondary: brandColors.secondary,
    logoSvg: trim(stored?.logoSvg),
    iconSvg: trim(stored?.iconSvg),
    logoHasRaster: Boolean(stored?.logoData && stored?.logoMediaType),
    iconHasRaster: Boolean(stored?.iconData && stored?.iconMediaType),
    ogHasRaster: Boolean(stored?.ogData && stored?.ogMediaType),
    ...logo,
    ...icon,
  };
  _cachedName = name;
  _cachedDomain = domain;
  return config;
}

/** Full resolved branding for the current deployment. */
export async function getCompanyConfig(request?: Request): Promise<CompanyConfig> {
  let stored = await getStoredCompanyConfig();
  stored = (await persistOfficialReavePublicEmail(stored)) ?? stored;
  return resolveFromStored(stored, request);
}

let _persistedOfficialReavePublicEmail = false;

/** Write get@reave.app into Admin → Company on the official install when the row is empty or stale. */
async function persistOfficialReavePublicEmail(
  stored: StoredCompanyConfig | null,
): Promise<StoredCompanyConfig | null> {
  if (_persistedOfficialReavePublicEmail) return stored;
  if (!isCanonicalReaveInstall()) {
    _persistedOfficialReavePublicEmail = true;
    return stored;
  }
  const patch = officialReavePublicEmailPatch(stored);
  if (!patch) {
    _persistedOfficialReavePublicEmail = true;
    return stored;
  }
  const ok = await setStoredCompanyConfig(patch);
  if (!ok) return stored;
  _persistedOfficialReavePublicEmail = true;
  return getStoredCompanyConfig();
}

/** Footer label — only "Powered by" is fixed; the name comes from settings. */
export function poweredByLabel(company: CompanyConfig): string {
  const name = trim(company.name);
  return name ? `Powered by ${name}` : 'Powered by';
}

/** Default Resend From header unless RESEND_FROM is set. */
export async function resolveEmailFrom(): Promise<string> {
  const explicit = canonicalizeReaveBrandEmail(trim(serverEnv('RESEND_FROM')));
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
  /** Ignored on save — hostname comes from PUBLIC_SITE_DOMAIN / COMPANY_DOMAIN. */
  domain?: string;
  supportEmail?: string;
  supportPhone?: string;
  fromEmail?: string;
  address?: string;
  geo?: CompanyGeo | null;
  vapiAssistantId?: string;
  vapiFirstMessage?: string;
  vapiSystemPrompt?: string;
  portalOutreachNotice?: string;
  socialTwitter?: string;
  socialInstagram?: string;
  socialLinkedin?: string;
  socialFacebook?: string;
  socialYoutube?: string;
  socialTiktok?: string;
  socialBluesky?: string;
  socialThreads?: string;
  socialPinterest?: string;
  socialSnapchat?: string;
  socialDiscord?: string;
  socialReddit?: string;
  socialGithub?: string;
  socialTwitch?: string;
  socialTelegram?: string;
  socialWhatsapp?: string;
  socialSubstack?: string;
  socialYelp?: string;
  socialGoogleBusiness?: string;
  socialHiddenPlatforms?: string[] | string;
  fontPrimary?: string;
  fontSecondary?: string;
  fontContent?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  /** Paste full <svg>…</svg> for animated header wordmark. */
  logoSvg?: string;
  /** Paste full <svg>…</svg> for animated homepage hero icon. */
  iconSvg?: string;
};

export function normalizeCompanyInput(input: CompanyConfigInput): StoredCompanyConfig {
  const out: StoredCompanyConfig = {};
  if (input.name !== undefined) out.name = trim(input.name) || null;
  if (input.legalName !== undefined) out.legalName = trim(input.legalName) || null;
  if (input.description !== undefined) out.description = trim(input.description) || null;
  // Domain is Railway-owned (PUBLIC_SITE_DOMAIN / COMPANY_DOMAIN). Ignore client writes.
  if (input.supportEmail !== undefined) {
    out.supportEmail = canonicalizeReaveBrandEmail(trim(input.supportEmail)) || null;
  }
  if (input.supportPhone !== undefined) out.supportPhone = trim(input.supportPhone) || null;
  if (input.fromEmail !== undefined) {
    out.fromEmail = canonicalizeReaveBrandEmail(trim(input.fromEmail)) || null;
  }
  if (input.address !== undefined) out.address = trim(input.address) || null;
  if (input.vapiAssistantId !== undefined) out.vapiAssistantId = trim(input.vapiAssistantId) || null;
  if (input.vapiFirstMessage !== undefined) {
    out.vapiFirstMessage = input.vapiFirstMessage.trim() ? input.vapiFirstMessage : null;
  }
  if (input.vapiSystemPrompt !== undefined) {
    out.vapiSystemPrompt = input.vapiSystemPrompt.trim() ? input.vapiSystemPrompt : null;
  }
  if (input.portalOutreachNotice !== undefined) {
    out.portalOutreachNotice = input.portalOutreachNotice.trim() ? input.portalOutreachNotice : '';
  }
  if (input.socialTwitter !== undefined) out.socialTwitter = trim(input.socialTwitter) || null;
  if (input.socialInstagram !== undefined) out.socialInstagram = trim(input.socialInstagram) || null;
  if (input.socialLinkedin !== undefined) out.socialLinkedin = trim(input.socialLinkedin) || null;
  if (input.socialFacebook !== undefined) out.socialFacebook = trim(input.socialFacebook) || null;
  if (input.socialYoutube !== undefined) out.socialYoutube = trim(input.socialYoutube) || null;
  if (input.socialTiktok !== undefined) out.socialTiktok = trim(input.socialTiktok) || null;
  if (input.socialBluesky !== undefined) out.socialBluesky = trim(input.socialBluesky) || null;
  if (input.socialThreads !== undefined) out.socialThreads = trim(input.socialThreads) || null;
  if (input.socialPinterest !== undefined) out.socialPinterest = trim(input.socialPinterest) || null;
  if (input.socialSnapchat !== undefined) out.socialSnapchat = trim(input.socialSnapchat) || null;
  if (input.socialDiscord !== undefined) out.socialDiscord = trim(input.socialDiscord) || null;
  if (input.socialReddit !== undefined) out.socialReddit = trim(input.socialReddit) || null;
  if (input.socialGithub !== undefined) out.socialGithub = trim(input.socialGithub) || null;
  if (input.socialTwitch !== undefined) out.socialTwitch = trim(input.socialTwitch) || null;
  if (input.socialTelegram !== undefined) out.socialTelegram = trim(input.socialTelegram) || null;
  if (input.socialWhatsapp !== undefined) out.socialWhatsapp = trim(input.socialWhatsapp) || null;
  if (input.socialSubstack !== undefined) out.socialSubstack = trim(input.socialSubstack) || null;
  if (input.socialYelp !== undefined) out.socialYelp = trim(input.socialYelp) || null;
  if (input.socialGoogleBusiness !== undefined) {
    out.socialGoogleBusiness = trim(input.socialGoogleBusiness) || null;
  }
  if (input.socialHiddenPlatforms !== undefined) {
    const raw = input.socialHiddenPlatforms;
    if (typeof raw === 'string') {
      try {
        out.socialHiddenPlatforms = parseHiddenSocialPlatforms(JSON.parse(raw));
      } catch {
        out.socialHiddenPlatforms = [];
      }
    } else {
      out.socialHiddenPlatforms = parseHiddenSocialPlatforms(raw);
    }
  }
  if (input.fontPrimary !== undefined) {
    out.fontPrimary = normalizeBrandFontInput(input.fontPrimary, 'primary');
  }
  if (input.fontSecondary !== undefined) {
    out.fontSecondary = normalizeBrandFontInput(input.fontSecondary, 'secondary');
  }
  if (input.fontContent !== undefined) {
    out.fontContent = normalizeBrandFontInput(input.fontContent, 'content');
  }
  if (input.brandPrimary !== undefined) {
    out.brandPrimary = normalizeBrandColorHex(input.brandPrimary);
  }
  if (input.brandSecondary !== undefined) {
    out.brandSecondary = normalizeBrandColorHex(input.brandSecondary);
  }
  if (input.logoSvg !== undefined) {
    const t = input.logoSvg.trim();
    out.logoSvg = t || null;
  }
  if (input.iconSvg !== undefined) {
    const t = input.iconSvg.trim();
    out.iconSvg = t || null;
  }
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
