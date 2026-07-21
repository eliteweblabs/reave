/**
 * Persist organization branding (company name, domain, logo, etc.).
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

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
  vapiAssistantId?: string | null;
  vapiFirstMessage?: string | null;
  vapiSystemPrompt?: string | null;
  socialTwitter?: string | null;
  socialInstagram?: string | null;
  socialLinkedin?: string | null;
  socialFacebook?: string | null;
  socialYoutube?: string | null;
  socialTiktok?: string | null;
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
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_place_id TEXT;
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS geo_geocoded_at TIMESTAMPTZ;
`;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;
let _cached: StoredCompanyConfig | null | undefined = undefined;

function databaseUrl(): string | undefined {
  return serverEnv('DATABASE_URL')?.trim() || undefined;
}

function poolSsl(url: string): pg.ConnectionConfig['ssl'] {
  if (/sslmode=(require|verify-full|verify-ca)/i.test(url)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

function getPool(): pg.Pool | null {
  if (_pool !== undefined) return _pool;
  const url = databaseUrl();
  if (!url) {
    _pool = null;
    return null;
  }
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 5 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
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

function projectRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function configFilePath(): string {
  const override = serverEnv('COMPANY_CONFIG_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'company-config.json');
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
    vapiAssistantId: str('vapiAssistantId') || null,
    vapiFirstMessage: typeof o.vapiFirstMessage === 'string' ? o.vapiFirstMessage : null,
    vapiSystemPrompt: typeof o.vapiSystemPrompt === 'string' ? o.vapiSystemPrompt : null,
    socialTwitter: str('socialTwitter') || null,
    socialInstagram: str('socialInstagram') || null,
    socialLinkedin: str('socialLinkedin') || null,
    socialFacebook: str('socialFacebook') || null,
    socialYoutube: str('socialYoutube') || null,
    socialTiktok: str('socialTiktok') || null,
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
    vapi_assistant_id: string | null;
    vapi_first_message: string | null;
    vapi_system_prompt: string | null;
    social_twitter: string | null;
    social_instagram: string | null;
    social_linkedin: string | null;
    social_facebook: string | null;
    social_youtube: string | null;
    social_tiktok: string | null;
    address: string | null;
    geo_lat: number | null;
    geo_lng: number | null;
    geo_place_id: string | null;
    geo_geocoded_at: Date | string | null;
    updated_at: Date | string | null;
  }>(
    `SELECT name, legal_name, description, domain, support_email, support_phone, from_email,
            logo_path, logo_data, logo_media_type,
            icon_path, icon_data, icon_media_type,
            vapi_assistant_id, vapi_first_message, vapi_system_prompt,
            social_twitter, social_instagram, social_linkedin, social_facebook,
            social_youtube, social_tiktok, address, geo_lat, geo_lng, geo_place_id, geo_geocoded_at,
            updated_at
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
    vapiAssistantId: row.vapi_assistant_id,
    vapiFirstMessage: row.vapi_first_message,
    vapiSystemPrompt: row.vapi_system_prompt,
    socialTwitter: row.social_twitter,
    socialInstagram: row.social_instagram,
    socialLinkedin: row.social_linkedin,
    socialFacebook: row.social_facebook,
    socialYoutube: row.social_youtube,
    socialTiktok: row.social_tiktok,
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
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  });
}

async function writePgConfig(config: StoredCompanyConfig): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
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
       vapi_assistant_id = $14,
       vapi_first_message = $15,
       vapi_system_prompt = $16,
       social_twitter = $17,
       social_instagram = $18,
       social_linkedin = $19,
       social_facebook = $20,
       social_youtube = $21,
       social_tiktok = $22,
       address = $23,
       geo_lat = $24,
       geo_lng = $25,
       geo_place_id = $26,
       geo_geocoded_at = $27,
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
      config.vapiAssistantId ?? null,
      config.vapiFirstMessage ?? null,
      config.vapiSystemPrompt ?? null,
      config.socialTwitter ?? null,
      config.socialInstagram ?? null,
      config.socialLinkedin ?? null,
      config.socialFacebook ?? null,
      config.socialYoutube ?? null,
      config.socialTiktok ?? null,
      config.address ?? null,
      config.geo?.lat ?? null,
      config.geo?.lng ?? null,
      config.geo?.placeId ?? null,
      config.geo?.geocodedAt ? new Date(config.geo.geocodedAt) : null,
    ],
  );
  return true;
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
  });
}

export function clearCompanyConfigCache(): void {
  _cached = undefined;
}
