/**
 * Sales proposals — public /proposal/:slug pages with demo + Crater invoice links.
 * Postgres when DATABASE_URL is set; otherwise JSON under config/proposals/.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { projectRoot } from './projectRoot';
import { serverEnv } from './serverEnv';
import { storeReadWork } from './workStore';

export type SalesProposal = {
  slug: string;
  title: string;
  clientName: string;
  headline: string;
  lede: string;
  demoUrl: string;
  invoiceUrl: string | null;
  /** Work project slug — body markdown is rendered on the public page when set. */
  workSlug: string | null;
  priceLabel: string;
  priceNote: string;
  published: boolean;
  includes: string[];
  /** Fallback when workSlug is empty or missing. */
  bodyMarkdown: string;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sales_proposals (
  slug        VARCHAR(255) PRIMARY KEY,
  payload     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

let _schemaReady: Promise<void> | null = null;

function proposalsDir(): string {
  return join(projectRoot(), 'config', 'proposals');
}

function proposalFilePath(slug: string): string {
  return join(proposalsDir(), `${slug}.json`);
}

function invoiceEnvOverride(slug: string): string | null {
  const key = `PROPOSAL_${slug.replace(/[^a-z0-9]+/gi, '_').toUpperCase()}_INVOICE_URL`;
  return serverEnv(key)?.trim() || null;
}

function normalizeProposal(raw: unknown, slug: string): SalesProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const resolvedSlug = String(o.slug || slug).trim();
  if (!resolvedSlug) return null;
  const includes = Array.isArray(o.includes)
    ? o.includes.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const invoiceUrl =
    invoiceEnvOverride(resolvedSlug) ||
    (typeof o.invoiceUrl === 'string' && o.invoiceUrl.trim() ? o.invoiceUrl.trim() : null);
  return {
    slug: resolvedSlug,
    title: String(o.title || resolvedSlug).trim(),
    clientName: String(o.clientName || '').trim(),
    headline: String(o.headline || '').trim(),
    lede: String(o.lede || '').trim(),
    demoUrl: String(o.demoUrl || '').trim(),
    invoiceUrl,
    workSlug: typeof o.workSlug === 'string' && o.workSlug.trim() ? o.workSlug.trim() : null,
    priceLabel: String(o.priceLabel || '').trim(),
    priceNote: String(o.priceNote || '').trim(),
    published: o.published !== false,
    includes,
    bodyMarkdown: String(o.bodyMarkdown || '').trim(),
  };
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPgPool();
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

function readProposalFile(slug: string): SalesProposal | null {
  const path = proposalFilePath(slug);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return normalizeProposal(raw, slug);
  } catch {
    return null;
  }
}

function writeProposalFile(proposal: SalesProposal): void {
  const dir = proposalsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(proposalFilePath(proposal.slug), `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
}

async function readProposalDb(slug: string): Promise<SalesProposal | null> {
  const pool = await ensureSchema();
  if (!pool) return null;
  const { rows } = await pool.query<{ payload: unknown }>(
    `SELECT payload FROM sales_proposals WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  if (!rows[0]?.payload) return null;
  return normalizeProposal(rows[0].payload, slug);
}

async function writeProposalDb(proposal: SalesProposal): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) {
    writeProposalFile(proposal);
    return;
  }
  await pool.query(
    `INSERT INTO sales_proposals (slug, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (slug) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [proposal.slug, JSON.stringify(proposal)],
  );
}

export function listProposalSlugsFromFiles(): string[] {
  const dir = proposalsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.replace(/\.json$/i, ''));
}

export async function getSalesProposal(slug: string): Promise<SalesProposal | null> {
  const clean = slug.trim();
  if (!clean) return null;
  const fromDb = await readProposalDb(clean);
  if (fromDb) return fromDb;
  const fromFile = readProposalFile(clean);
  if (fromFile) {
    if (!fromDb && databaseUrl()) {
      await writeProposalDb(fromFile).catch(() => undefined);
    }
    return fromFile;
  }
  return null;
}

export async function getPublicSalesProposal(slug: string): Promise<SalesProposal | null> {
  const proposal = await getSalesProposal(slug);
  if (!proposal?.published) return null;
  return proposal;
}

export async function saveSalesProposal(
  slug: string,
  patch: Partial<SalesProposal>,
): Promise<SalesProposal | null> {
  const clean = slug.trim();
  if (!clean) return null;
  const existing = (await readProposalDb(clean)) || readProposalFile(clean);
  if (!existing) return null;
  const merged = normalizeProposal({ ...existing, ...patch, slug: clean }, clean);
  if (!merged) return null;
  await writeProposalDb(merged);
  return merged;
}

export async function findProposalByWorkSlug(workSlug: string): Promise<SalesProposal | null> {
  const clean = workSlug.trim();
  if (!clean) return null;
  for (const slug of listProposalSlugsFromFiles()) {
    const proposal = await getSalesProposal(slug);
    if (proposal?.workSlug === clean) return proposal;
  }
  const pool = await ensureSchema();
  if (pool) {
    const { rows } = await pool.query<{ slug: string; payload: unknown }>(
      `SELECT slug, payload FROM sales_proposals`,
    );
    for (const row of rows) {
      const proposal = normalizeProposal(row.payload, row.slug);
      if (proposal?.workSlug === clean) return proposal;
    }
  }
  return null;
}

export async function proposalBodyMarkdown(proposal: SalesProposal): Promise<string> {
  if (proposal.workSlug) {
    const work = await storeReadWork(proposal.workSlug);
    if (work?.body?.trim()) return work.body.trim();
  }
  return proposal.bodyMarkdown;
}

export function proposalsStorageBackend(): 'postgres' | 'files' {
  return databaseUrl() ? 'postgres' : 'files';
}
