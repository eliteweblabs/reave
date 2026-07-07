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

export type StoredCompanyConfig = {
  name?: string | null;
  legalName?: string | null;
  description?: string | null;
  domain?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  fromEmail?: string | null;
  /** Legacy external/path override; empty string = hide default logo. */
  logoPath?: string | null;
  logoData?: string | null;
  logoMediaType?: string | null;
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
ALTER TABLE company_config ADD COLUMN IF NOT EXISTS support_phone TEXT;
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

function normalizeStored(raw: unknown): StoredCompanyConfig {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const str = (k: string) => {
    const v = o[k];
    return typeof v === 'string' ? v.trim() : '';
  };
  return {
    name: str('name') || null,
    legalName: str('legalName') || null,
    description: str('description') || null,
    domain: str('domain') || null,
    supportEmail: str('supportEmail') || null,
    supportPhone: str('supportPhone') || null,
    fromEmail: str('fromEmail') || null,
    logoPath: typeof o.logoPath === 'string' ? o.logoPath.trim() : null,
    logoData: typeof o.logoData === 'string' && o.logoData ? o.logoData : null,
    logoMediaType: typeof o.logoMediaType === 'string' && o.logoMediaType ? o.logoMediaType.trim() : null,
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
    updated_at: Date | string | null;
  }>(
    `SELECT name, legal_name, description, domain, support_email, support_phone, from_email,
            logo_path, logo_data, logo_media_type, updated_at
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

export function clearCompanyConfigCache(): void {
  _cached = undefined;
}
