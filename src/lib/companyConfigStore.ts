/**
 * Persist organization branding (company name, domain, logo, etc.).
 * Postgres (DATABASE_URL) when set, otherwise JSON under src/knowledge/.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from './serverEnv';

export type StoredCompanyConfig = {
  name?: string | null;
  legalName?: string | null;
  description?: string | null;
  domain?: string | null;
  supportEmail?: string | null;
  fromEmail?: string | null;
  logoPath?: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS company_config (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  name            TEXT,
  legal_name      TEXT,
  description     TEXT,
  domain          TEXT,
  support_email   TEXT,
  from_email      TEXT,
  logo_path       TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO company_config (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
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
    fromEmail: str('fromEmail') || null,
    logoPath: str('logoPath') || null,
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
    writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8');
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
    from_email: string | null;
    logo_path: string | null;
  }>(
    `SELECT name, legal_name, description, domain, support_email, from_email, logo_path
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
    fromEmail: row.from_email,
    logoPath: row.logo_path,
  });
}

async function writePgConfig(config: StoredCompanyConfig): boolean {
  const pool = await ensureSchema();
  if (!pool) return false;
  await pool.query(
    `UPDATE company_config SET
       name = $1,
       legal_name = $2,
       description = $3,
       domain = $4,
       support_email = $5,
       from_email = $6,
       logo_path = $7,
       updated_at = now()
     WHERE id = 1`,
    [
      config.name ?? null,
      config.legalName ?? null,
      config.description ?? null,
      config.domain ?? null,
      config.supportEmail ?? null,
      config.fromEmail ?? null,
      config.logoPath ?? null,
    ],
  );
  return true;
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

export async function setStoredCompanyConfig(config: StoredCompanyConfig): Promise<boolean> {
  const normalized = normalizeStored(config);
  try {
    const ok =
      companyConfigStorageBackend() === 'postgres'
        ? await writePgConfig(normalized)
        : writeFileConfig(normalized);
    if (ok) _cached = normalized;
    return ok;
  } catch (e) {
    console.error('[company-config] write failed', e);
    return false;
  }
}

export function clearCompanyConfigCache(): void {
  _cached = undefined;
}
