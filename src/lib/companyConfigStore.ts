/**
 * Persist organization branding (company name, domain, logo, etc.).
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { serverEnv } from './serverEnv';
import { parseHiddenSocialPlatforms } from './social/platforms.ts';
import { parseStoredBusinessHours, type BusinessHours } from './businessHours';
import { projectRoot } from './projectRoot';

export type StoredCompanyLogo = {
  dataBase64: string;
  mediaType: string;
};

export type StoredCompanyGeo = {
  lat: number;
  lng: number;
  placeId?: string | null;
  geocodedAt?: string | null;
};

export type StoredCompanyConfig = {
  name?: string | null;
  legalName?: string | null;
  description?: string | null;
  domain?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  fromEmail?: string | null;
  /** Office / business street address (admin Company panel + map). */
  address?: string | null;
  geo?: StoredCompanyGeo | null;
  /** Legacy external/path override; empty string = hide default logo. */
  logoPath?: string | null;
  logoData?: string | null;
  logoMediaType?: string | null;
  /** Legacy external/path override for square brand icon. */
  iconPath?: string | null;
  iconData?: string | null;
  iconMediaType?: string | null;
  /** Owner-pasted inline SVG for header wordmark. */
  logoSvg?: string | null;
  /** Owner-pasted inline SVG for homepage hero icon. */
  iconSvg?: string | null;
  /** Admin-uploaded default social-share (OG) image. */
  ogData?: string | null;
  ogMediaType?: string | null;
  vapiAssistantId?: string | null;
  vapiFirstMessage?: string | null;
  vapiSystemPrompt?: string | null;
  /** Client portal auto-open outreach sheet; empty string = disabled. */
  portalOutreachNotice?: string | null;
  socialTwitter?: string | null;
  socialInstagram?: string | null;
  socialLinkedin?: string | null;
  socialFacebook?: string | null;
  socialYoutube?: string | null;
  socialTiktok?: string | null;
  socialBluesky?: string | null;
  socialThreads?: string | null;
  socialPinterest?: string | null;
  socialSnapchat?: string | null;
  socialDiscord?: string | null;
  socialReddit?: string | null;
  socialGithub?: string | null;
  socialTwitch?: string | null;
  socialTelegram?: string | null;
  socialWhatsapp?: string | null;
  socialSubstack?: string | null;
  socialYelp?: string | null;
  socialGoogleBusiness?: string | null;
  socialHiddenPlatforms?: string[] | null;
  /** Admin-selected primary (headline) font id — see brandFonts.ts */
  fontPrimary?: string | null;
  /** Admin-selected secondary (labels/UI) font id */
  fontSecondary?: string | null;
  /** Admin-selected content (body) font id */
  fontContent?: string | null;
  /** Admin-selected email-safe font id for outbound HTML templates. */
  emailFont?: string | null;
  /** Google Fonts `family=` specs for google:* font ids (survives restarts). */
  fontGoogleSpecs?: Record<string, string> | null;
  /** Admin-selected primary brand color (hex). */
  brandPrimary?: string | null;
  /** Admin-selected secondary brand color (hex). */
  brandSecondary?: string | null;
  /** Admin-selected Home Screen / favicon tile background (hex). */
  iconBackground?: string | null;
  /** Structured weekly hours for listings / scheduling (Google day index 0 = Sunday). */
  businessHours?: BusinessHours | null;
  /** When true, saving hours also updates Cal.com Working Hours / Availability. */
  syncHoursToCalcom?: boolean | null;
  updatedAt?: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS company_config (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name            TEXT,
  legal_name      TEXT,
  description     TEXT,
  domain          TEXT,
  support_email   TEXT,
  support_phone   TEXT,
  from_email      TEXT,
  logo_path       TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO company_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
`;

const SCHEMA_MIGRATE_SQL = `
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS logo_data TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS logo_media_type TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS icon_path TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS icon_data TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS icon_media_type TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS logo_svg TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS icon_svg TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS support_phone TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS vapi_assistant_id TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS vapi_first_message TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS vapi_system_prompt TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_twitter TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_instagram TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_linkedin TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_facebook TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_youtube TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_tiktok TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_bluesky TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_threads TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_pinterest TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_snapchat TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_discord TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_reddit TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_github TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_twitch TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_telegram TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_whatsapp TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_substack TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_yelp TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_google_business TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS social_hidden_platforms TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_place_id TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_geocoded_at TIMESTAMPTZ;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS font_display TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS font_body TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS font_primary TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS font_secondary TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS font_content TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS font_google_specs TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS brand_primary TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS brand_secondary TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS icon_background TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS portal_outreach_notice TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS og_data TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS og_media_type TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS email_font TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS business_hours TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS sync_hours_to_calcom BOOLEAN;
`;

let _schemaReady: Promise<void> | null = null;
let _cached: StoredCompanyConfig | null | undefined = undefined;

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool
      .query(SCHEMA_SQL)
      .then(() => pool.query(SCHEMA_MIGRATE_SQL))
      .then(() => undefined)
      .catch((e) => {
        _schemaReady = null;
        throw e;
      });
  }
  await _schemaReady;
  return pool;
}

function configFilePath(): string {
  const override = serverEnv('COMPANY_CONFIG_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'company-config.json');
}

function parseStoredBusinessHoursJson(raw: string | null | undefined): BusinessHours | null {
  if (!raw?.trim()) return null;
  try {
    return parseStoredBusinessHours(JSON.parse(raw));
  } catch {
    return null;
  }
}

function parseFontGoogleSpecs(raw: unknown): Record<string, string> | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return parseFontGoogleSpecs(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== 'object') return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.trim()) out[key] = value.trim();
  }
  return Object.keys(out).length ? out : null;
}

function parseStoredGeo(raw: unknown): StoredCompanyGeo | null {
  if (!raw || typeof raw !== 'object') return null;
  const lat = Number((raw as { lat?: unknown }).lat);
  const lng = Number((raw as { lng?: unknown }).lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const placeId =
    typeof (raw as { placeId?: unknown }).placeId === 'string'
      ? (raw as { placeId: string }).placeId.trim()
      : '';
  const geocodedAt =
    typeof (raw as { geocodedAt?: unknown }).geocodedAt === 'string'
      ? (raw as { geocodedAt: string }).geocodedAt.trim()
      : '';
  return {
    lat,
    lng,
    placeId: placeId || null,
    geocodedAt: geocodedAt || null,
  };
}

function normalizeStored(raw: unknown): StoredCompanyConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const str = (k: string) => {
    const v = o[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  const geo =
    parseStoredGeo(o.geo) ||
    parseStoredGeo({
      lat: o.geoLat ?? o.geo_lat,
      lng: o.geoLng ?? o.geo_lng,
      placeId: o.geoPlaceId ?? o.geo_place_id,
      geocodedAt: o.geoGeocodedAt ?? o.geo_geocoded_at,
    });
  return {
    name: str('name') || null,
    legalName: str('legalName') || null,
    description: str('description') || null,
    domain: str('domain') || null,
    supportEmail: str('supportEmail') || null,
    supportPhone: str('supportPhone') || null,
    fromEmail: str('fromEmail') || null,
    address: str('address') || null,
    geo,
    logoPath: typeof o.logoPath === 'string' ? o.logoPath.trim() : null,
    logoData: typeof o.logoData === 'string' && o.logoData ? o.logoData : null,
    logoMediaType: typeof o.logoMediaType === 'string' && o.logoMediaType ? o.logoMediaType.trim() : null,
    iconPath: typeof o.iconPath === 'string' ? o.iconPath.trim() : null,
    iconData: typeof o.iconData === 'string' && o.iconData ? o.iconData : null,
    iconMediaType: typeof o.iconMediaType === 'string' && o.iconMediaType ? o.iconMediaType.trim() : null,
    logoSvg: typeof o.logoSvg === 'string' && o.logoSvg.trim() ? o.logoSvg : null,
    iconSvg: typeof o.iconSvg === 'string' && o.iconSvg.trim() ? o.iconSvg : null,
    ogData: typeof o.ogData === 'string' && o.ogData ? o.ogData : null,
    ogMediaType: typeof o.ogMediaType === 'string' && o.ogMediaType ? o.ogMediaType.trim() : null,
    vapiAssistantId: str('vapiAssistantId') || null,
    vapiFirstMessage: typeof o.vapiFirstMessage === 'string' ? o.vapiFirstMessage : null,
    vapiSystemPrompt: typeof o.vapiSystemPrompt === 'string' ? o.vapiSystemPrompt : null,
    portalOutreachNotice: typeof o.portalOutreachNotice === 'string' ? o.portalOutreachNotice : null,
    socialTwitter: str('socialTwitter') || null,
    socialInstagram: str('socialInstagram') || null,
    socialLinkedin: str('socialLinkedin') || null,
    socialFacebook: str('socialFacebook') || null,
    socialYoutube: str('socialYoutube') || null,
    socialTiktok: str('socialTiktok') || null,
    socialBluesky: str('socialBluesky') || null,
    socialThreads: str('socialThreads') || null,
    socialPinterest: str('socialPinterest') || null,
    socialSnapchat: str('socialSnapchat') || null,
    socialDiscord: str('socialDiscord') || null,
    socialReddit: str('socialReddit') || null,
    socialGithub: str('socialGithub') || null,
    socialTwitch: str('socialTwitch') || null,
    socialTelegram: str('socialTelegram') || null,
    socialWhatsapp: str('socialWhatsapp') || null,
    socialSubstack: str('socialSubstack') || null,
    socialYelp: str('socialYelp') || null,
    socialGoogleBusiness: str('socialGoogleBusiness') || null,
    socialHiddenPlatforms: parseHiddenSocialPlatforms(o.socialHiddenPlatforms),
    fontPrimary: str('fontPrimary') || str('fontDisplay') || null,
    fontSecondary: str('fontSecondary') || null,
    fontContent: str('fontContent') || str('fontBody') || null,
    fontGoogleSpecs: parseFontGoogleSpecs(o.fontGoogleSpecs ?? o.font_google_specs),
    emailFont: str('emailFont') || str('email_font') || null,
    brandPrimary: str('brandPrimary') || str('brand_primary') || null,
    brandSecondary: str('brandSecondary') || str('brand_secondary') || null,
    iconBackground: str('iconBackground') || str('icon_background') || null,
    businessHours: parseStoredBusinessHours(o.businessHours),
    syncHoursToCalcom:
      o.syncHoursToCalcom === true ||
      o.syncHoursToCalcom === 'true' ||
      o.sync_hours_to_calcom === true ||
      o.sync_hours_to_calcom === 'true'
        ? true
        : o.syncHoursToCalcom === false ||
            o.syncHoursToCalcom === 'false' ||
            o.sync_hours_to_calcom === false ||
            o.sync_hours_to_calcom === 'false'
          ? false
          : null,
    updatedAt: typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : null,
  };
}

function readFileConfig(): StoredCompanyConfig | null {
  try {
    const path = configFilePath();
    if (!existsSync(path)) return null;
    return normalizeStored(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

function writeFileConfig(config: StoredCompanyConfig): boolean {
  try {
    const path = configFilePath();
    mkdirSync(dirname(path), { recursive: true });
    const payload = { ...config, updatedAt: new Date().toISOString() };
    writeFileSync(path, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[company-config] file write failed', e);
    return false;
  }
}

async function readPgConfig(): Promise<StoredCompanyConfig | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const res = await pool.query<{
    name: string | null;
    legal_name: string | null;
    description: string | null;
    domain: string | null;
    support_email: string | null;
    support_phone: string | null;
    from_email: string | null;
    logo_path: string | null;
    logo_data: string | null;
    logo_media_type: string | null;
    icon_path: string | null;
    icon_data: string | null;
    icon_media_type: string | null;
    logo_svg: string | null;
    icon_svg: string | null;
    vapi_assistant_id: string | null;
    vapi_first_message: string | null;
    vapi_system_prompt: string | null;
    social_twitter: string | null;
    social_instagram: string | null;
    social_linkedin: string | null;
    social_facebook: string | null;
    social_youtube: string | null;
    social_tiktok: string | null;
    social_bluesky: string | null;
    social_threads: string | null;
    social_pinterest: string | null;
    social_snapchat: string | null;
    social_discord: string | null;
    social_reddit: string | null;
    social_github: string | null;
    social_twitch: string | null;
    social_telegram: string | null;
    social_whatsapp: string | null;
    social_substack: string | null;
    social_yelp: string | null;
    social_google_business: string | null;
    social_hidden_platforms: string | null;
    address: string | null;
    geo_lat: number | null;
    geo_lng: number | null;
    geo_place_id: string | null;
    geo_geocoded_at: Date | string | null;
    font_display: string | null;
    font_body: string | null;
    font_primary: string | null;
    font_secondary: string | null;
    font_content: string | null;
    font_google_specs: string | null;
    brand_primary: string | null;
    brand_secondary: string | null;
    icon_background: string | null;
    portal_outreach_notice: string | null;
    og_data: string | null;
    og_media_type: string | null;
    email_font: string | null;
    business_hours: string | null;
    sync_hours_to_calcom: boolean | null;
    updated_at: Date | string | null;
  }>(
    `SELECT name, legal_name, description, domain, support_email, support_phone, from_email,
            logo_path, logo_data, logo_media_type, logo_svg,
            icon_path, icon_data, icon_media_type, icon_svg,
            vapi_assistant_id, vapi_first_message, vapi_system_prompt,
            social_twitter, social_instagram, social_linkedin, social_facebook,
            social_youtube, social_tiktok, social_bluesky, social_threads, social_pinterest,
            social_snapchat, social_discord, social_reddit, social_github, social_twitch,
            social_telegram, social_whatsapp, social_substack, social_yelp, social_google_business,
            social_hidden_platforms, address, geo_lat, geo_lng, geo_place_id, geo_geocoded_at,
            font_display, font_body, font_primary, font_secondary, font_content, font_google_specs,
            brand_primary, brand_secondary, icon_background, portal_outreach_notice,
            og_data, og_media_type, email_font, business_hours, sync_hours_to_calcom, updated_at
     FROM company_config WHERE id = 1 LIMIT 1`,
  );
  const row = res.rows[0];
  if (!row) return null;
  return normalizeStored({
    name: row.name,
    legalName: row.legal_name,
    description: row.description,
    domain: row.domain,
    supportEmail: row.support_email,
    supportPhone: row.support_phone,
    fromEmail: row.from_email,
    logoPath: row.logo_path,
    logoData: row.logo_data,
    logoMediaType: row.logo_media_type,
    iconPath: row.icon_path,
    iconData: row.icon_data,
    iconMediaType: row.icon_media_type,
    logoSvg: row.logo_svg,
    iconSvg: row.icon_svg,
    vapiAssistantId: row.vapi_assistant_id,
    vapiFirstMessage: row.vapi_first_message,
    vapiSystemPrompt: row.vapi_system_prompt,
    socialTwitter: row.social_twitter,
    socialInstagram: row.social_instagram,
    socialLinkedin: row.social_linkedin,
    socialFacebook: row.social_facebook,
    socialYoutube: row.social_youtube,
    socialTiktok: row.social_tiktok,
    socialBluesky: row.social_bluesky,
    socialThreads: row.social_threads,
    socialPinterest: row.social_pinterest,
    socialSnapchat: row.social_snapchat,
    socialDiscord: row.social_discord,
    socialReddit: row.social_reddit,
    socialGithub: row.social_github,
    socialTwitch: row.social_twitch,
    socialTelegram: row.social_telegram,
    socialWhatsapp: row.social_whatsapp,
    socialSubstack: row.social_substack,
    socialYelp: row.social_yelp,
    socialGoogleBusiness: row.social_google_business,
    socialHiddenPlatforms: parseHiddenSocialPlatforms(row.social_hidden_platforms),
    address: row.address,
    geo:
      row.geo_lat != null && row.geo_lng != null
        ? {
            lat: row.geo_lat,
            lng: row.geo_lng,
            placeId: row.geo_place_id,
            geocodedAt: row.geo_geocoded_at ? String(row.geo_geocoded_at) : null,
          }
        : null,
    fontPrimary: row.font_primary ?? row.font_display,
    fontSecondary: row.font_secondary ?? row.font_primary ?? row.font_display,
    fontContent: row.font_content ?? row.font_body,
    fontGoogleSpecs: parseFontGoogleSpecs(row.font_google_specs),
    brandPrimary: row.brand_primary,
    brandSecondary: row.brand_secondary,
    iconBackground: row.icon_background,
    portalOutreachNotice: row.portal_outreach_notice,
    ogData: row.og_data,
    ogMediaType: row.og_media_type,
    emailFont: row.email_font,
    businessHours: parseStoredBusinessHoursJson(row.business_hours),
    syncHoursToCalcom: row.sync_hours_to_calcom,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  });
}

async function writePgConfig(config: StoredCompanyConfig, retried = false): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  const result = await pool.query(
    `UPDATE company_config SET
       name = $1,
       legal_name = $2,
       description = $3,
       domain = $4,
       support_email = $5,
       support_phone = $6,
       from_email = $7,
       logo_path = $8,
       logo_data = $9,
       logo_media_type = $10,
       icon_path = $11,
       icon_data = $12,
       icon_media_type = $13,
       logo_svg = $14,
       icon_svg = $15,
       vapi_assistant_id = $16,
       vapi_first_message = $17,
       vapi_system_prompt = $18,
       social_twitter = $19,
       social_instagram = $20,
       social_linkedin = $21,
       social_facebook = $22,
       social_youtube = $23,
       social_tiktok = $24,
       social_bluesky = $25,
       social_threads = $26,
       social_pinterest = $27,
       social_snapchat = $28,
       social_discord = $29,
       social_reddit = $30,
       social_github = $31,
       social_twitch = $32,
       social_telegram = $33,
       social_whatsapp = $34,
       social_substack = $35,
       social_yelp = $36,
       social_google_business = $37,
       social_hidden_platforms = $38,
       address = $39,
       geo_lat = $40,
       geo_lng = $41,
       geo_place_id = $42,
       geo_geocoded_at = $43,
       font_display = $44,
       font_body = $45,
       font_primary = $46,
       font_secondary = $47,
       font_content = $48,
       font_google_specs = $49,
       brand_primary = $50,
       brand_secondary = $51,
       icon_background = $52,
       portal_outreach_notice = $53,
       og_data = $54,
       og_media_type = $55,
       email_font = $56,
       business_hours = $57,
       sync_hours_to_calcom = $58,
       updated_at = now()
     WHERE id = 1`,
    [
      config.name ?? null,
      config.legalName ?? null,
      config.description ?? null,
      config.domain ?? null,
      config.supportEmail ?? null,
      config.supportPhone ?? null,
      config.fromEmail ?? null,
      config.logoPath ?? null,
      config.logoData ?? null,
      config.logoMediaType ?? null,
      config.iconPath ?? null,
      config.iconData ?? null,
      config.iconMediaType ?? null,
      config.logoSvg ?? null,
      config.iconSvg ?? null,
      config.vapiAssistantId ?? null,
      config.vapiFirstMessage ?? null,
      config.vapiSystemPrompt ?? null,
      config.socialTwitter ?? null,
      config.socialInstagram ?? null,
      config.socialLinkedin ?? null,
      config.socialFacebook ?? null,
      config.socialYoutube ?? null,
      config.socialTiktok ?? null,
      config.socialBluesky ?? null,
      config.socialThreads ?? null,
      config.socialPinterest ?? null,
      config.socialSnapchat ?? null,
      config.socialDiscord ?? null,
      config.socialReddit ?? null,
      config.socialGithub ?? null,
      config.socialTwitch ?? null,
      config.socialTelegram ?? null,
      config.socialWhatsapp ?? null,
      config.socialSubstack ?? null,
      config.socialYelp ?? null,
      config.socialGoogleBusiness ?? null,
      config.socialHiddenPlatforms?.length
        ? JSON.stringify(config.socialHiddenPlatforms)
        : null,
      config.address ?? null,
      config.geo?.lat ?? null,
      config.geo?.lng ?? null,
      config.geo?.placeId ?? null,
      config.geo?.geocodedAt ? new Date(config.geo.geocodedAt) : null,
      config.fontPrimary ?? null,
      config.fontContent ?? null,
      config.fontPrimary ?? null,
      config.fontSecondary ?? null,
      config.fontContent ?? null,
      config.fontGoogleSpecs ? JSON.stringify(config.fontGoogleSpecs) : null,
      config.brandPrimary ?? null,
      config.brandSecondary ?? null,
      config.iconBackground ?? null,
      config.portalOutreachNotice ?? null,
      config.ogData ?? null,
      config.ogMediaType ?? null,
      config.emailFont ?? null,
      config.businessHours ? JSON.stringify(config.businessHours) : null,
      config.syncHoursToCalcom === true,
    ],
  );
  if ((result.rowCount ?? 0) > 0) return true;
  if (retried) return false;
  await pool.query(`INSERT INTO company_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  return writePgConfig(config, true);
}

function mergeStored(existing: StoredCompanyConfig | null, patch: StoredCompanyConfig): StoredCompanyConfig {
  return { ...(existing ?? {}), ...patch };
}

export function companyConfigStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}

export async function getStoredCompanyConfig(): Promise<StoredCompanyConfig | null> {
  if (_cached !== undefined) return _cached;
  try {
    if (companyConfigStorageBackend() === 'postgres') {
      _cached = await readPgConfig();
    } else {
      _cached = readFileConfig();
    }
  } catch (e) {
    console.error('[company-config] read failed', e);
    _cached = null;
  }
  return _cached;
}

export async function setStoredCompanyConfig(patch: StoredCompanyConfig): Promise<boolean> {
  const existing = _cached !== undefined ? _cached : await getStoredCompanyConfig();
  const merged = mergeStored(existing, patch);
  try {
    const ok =
      companyConfigStorageBackend() === 'postgres'
        ? await writePgConfig(merged)
        : writeFileConfig(merged);
    if (ok) {
      _cached = merged;
      const fresh = await readStoredFresh();
      if (fresh) _cached = fresh;
    }
    return ok;
  } catch (e) {
    console.error('[company-config] write failed', e);
    return false;
  }
}

async function readStoredFresh(): Promise<StoredCompanyConfig | null> {
  if (companyConfigStorageBackend() === 'postgres') {
    return readPgConfig();
  }
  return readFileConfig();
}

export async function getStoredCompanyLogo(): Promise<
  (StoredCompanyLogo & { updatedAt: string | null }) | null
> {
  const stored = await getStoredCompanyConfig();
  if (!stored?.logoData || !stored.logoMediaType) return null;
  return {
    dataBase64: stored.logoData,
    mediaType: stored.logoMediaType,
    updatedAt: stored.updatedAt ?? null,
  };
}

export async function setStoredCompanyLogo(logo: StoredCompanyLogo): Promise<boolean> {
  return setStoredCompanyConfig({
    logoData: logo.dataBase64,
    logoMediaType: logo.mediaType,
    logoPath: null,
  });
}

export async function clearStoredCompanyLogo(): Promise<boolean> {
  return setStoredCompanyConfig({
    logoData: null,
    logoMediaType: null,
    logoPath: null,
    logoSvg: null,
  });
}

export async function getStoredCompanyIcon(): Promise<
  (StoredCompanyLogo & { updatedAt: string | null }) | null
> {
  const stored = await getStoredCompanyConfig();
  if (!stored?.iconData || !stored.iconMediaType) return null;
  return {
    dataBase64: stored.iconData,
    mediaType: stored.iconMediaType,
    updatedAt: stored.updatedAt ?? null,
  };
}

export async function setStoredCompanyIcon(icon: StoredCompanyLogo): Promise<boolean> {
  return setStoredCompanyConfig({
    iconData: icon.dataBase64,
    iconMediaType: icon.mediaType,
    iconPath: null,
  });
}

export async function clearStoredCompanyIcon(): Promise<boolean> {
  return setStoredCompanyConfig({
    iconData: null,
    iconMediaType: null,
    iconPath: null,
    iconSvg: null,
  });
}

export async function setStoredCompanyOg(og: StoredCompanyLogo): Promise<boolean> {
  return setStoredCompanyConfig({
    ogData: og.dataBase64,
    ogMediaType: og.mediaType,
  });
}

export async function clearStoredCompanyOg(): Promise<boolean> {
  return setStoredCompanyConfig({
    ogData: null,
    ogMediaType: null,
  });
}

export function clearCompanyConfigCache(): void {
  _cached = undefined;
}
