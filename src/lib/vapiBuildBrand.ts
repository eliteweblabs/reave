/**
 * Resolve company branding for build-time scripts (no Astro runtime).
 * Reads admin Company details from Postgres, company-config.json, or env.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export type BuildBrandContext = {
  name: string;
  description: string;
  domain: string;
  siteUrl: string;
  contactsLabel: string;
  botUserAgent: string;
  projectLabel: string;
  inboundEmailExample: string;
};

const DEFAULT_NAME = 'Business OS';
const DEFAULT_DESCRIPTION = 'Automated client communication platform';

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

function trim(v: string | null | undefined): string {
  return (v ?? '').trim();
}

function domainFromEnv(): string {
  const raw = trim(process.env.COMPANY_DOMAIN) || trim(process.env.PUBLIC_SITE_DOMAIN);
  if (!raw) return '';
  return raw.replace(/^https?:\/\//, '').replace(/\/+$/, '').split('/')[0] ?? '';
}

function brandFromParts(input: {
  name?: string;
  description?: string;
  domain?: string;
  fromEmail?: string;
}): BuildBrandContext {
  const domain = trim(input.domain) || domainFromEnv();
  const name = trim(input.name) || trim(process.env.COMPANY_NAME) || DEFAULT_NAME;
  const description =
    trim(input.description) || trim(process.env.COMPANY_DESCRIPTION) || DEFAULT_DESCRIPTION;
  const fromEmail = trim(input.fromEmail) || trim(process.env.COMPANY_FROM_EMAIL) || (domain ? `noreply@${domain}` : '');
  const siteUrl = domain ? `https://${domain}/` : 'http://localhost:4321/';

  return {
    name,
    description,
    domain,
    siteUrl,
    contactsLabel: `${name} Contacts`,
    botUserAgent: `${name.replace(/\s+/g, '')}Bot/1.0`,
    projectLabel: `${name} App`,
    inboundEmailExample: fromEmail || (domain ? `inbox@mail.${domain}` : 'inbox@mail.example.com'),
  };
}

function readFileBrand(): BuildBrandContext | null {
  const path =
    trim(process.env.COMPANY_CONFIG_FILE) ||
    join(projectRoot(), 'src', 'knowledge', 'company-config.json');
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return brandFromParts({
      name: typeof raw.name === 'string' ? raw.name : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      fromEmail: typeof raw.fromEmail === 'string' ? raw.fromEmail : undefined,
    });
  } catch {
    return null;
  }
}

async function readPostgresBrand(): Promise<BuildBrandContext | null> {
  const url = trim(process.env.DATABASE_URL);
  if (!url) return null;

  const pool = new pg.Pool({
    connectionString: url,
    ssl: /sslmode=(require|verify-full|verify-ca)/i.test(url)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 1,
  });

  try {
    const res = await pool.query<{
      name: string | null;
      description: string | null;
      from_email: string | null;
    }>(
      `SELECT name, description, from_email FROM company_config WHERE id = 1 LIMIT 1`,
    );
    const row = res.rows[0];
    if (!row) return null;
    return brandFromParts({
      name: row.name ?? undefined,
      description: row.description ?? undefined,
      fromEmail: row.from_email ?? undefined,
    });
  } catch {
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Brand for Vapi prebuild sync — Postgres → file → env → defaults. */
export async function loadBuildBrandContext(): Promise<BuildBrandContext> {
  const fromPg = await readPostgresBrand();
  if (fromPg) return fromPg;

  const fromFile = readFileBrand();
  if (fromFile) return fromFile;

  return brandFromParts({});
}

function normalizeFeatureIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set([
    'client_portal',
    'web_handoff',
    'billing',
    'site_audits',
    'site_monitoring',
    'uptime_monitoring',
    'documents',
    'voice',
    'vapi',
    'carddav',
    'scheduling',
    'dev_infra',
  ]);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const id = item.trim();
    if (allowed.has(id)) out.push(id);
  }
  return out;
}

function readFileFeatures(): string[] | null {
  const path = join(projectRoot(), 'src', 'knowledge', 'features.json');
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    return normalizeFeatureIds((parsed as { enabled?: unknown }).enabled);
  } catch {
    return null;
  }
}

function parseFeaturesEnv(): string[] {
  const raw = trim(process.env.FEATURES);
  if (!raw) return [];
  try {
    return normalizeFeatureIds(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function readPostgresFeatures(): Promise<string[] | null> {
  const url = trim(process.env.DATABASE_URL);
  if (!url) return null;

  const pool = new pg.Pool({
    connectionString: url,
    ssl: /sslmode=(require|verify-full|verify-ca)/i.test(url)
      ? { rejectUnauthorized: false }
      : undefined,
    max: 1,
  });

  try {
    const res = await pool.query<{ enabled: unknown }>(
      'SELECT enabled FROM feature_config WHERE id = 1 LIMIT 1',
    );
    const row = res.rows[0];
    if (!row) return null;
    return normalizeFeatureIds(row.enabled);
  } catch {
    return null;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/** Enabled plugins for build scripts — Postgres → features.json → FEATURES env. */
export async function loadBuildEnabledFeatures(): Promise<string[]> {
  const fromPg = await readPostgresFeatures();
  if (fromPg?.length) return fromPg;

  const fromFile = readFileFeatures();
  if (fromFile?.length) return fromFile;

  const fromEnv = parseFeaturesEnv();
  if (fromEnv.length) return fromEnv;

  return [];
}
