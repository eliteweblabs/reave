/**
 * Tracked redirect links for project/client portal shares.
 * Token prefix encodes send time in base36: `{timestamp36}-{random}`.
 */

import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { clientPortalUrl } from './contactApi';
import { siteBaseUrl } from './requestOrigin';
import { serverEnv } from './serverEnv';

export type TrackedLinkChannel = 'share' | 'email' | 'sms' | 'manual';

export type TrackedLinkRecord = {
  token: string;
  job_slug: string;
  contact_uid: string;
  destination: string;
  sent_at: string;
  sent_by: string | null;
  channel: TrackedLinkChannel;
  click_count: number;
  first_clicked_at: string | null;
  last_clicked_at: string | null;
};

export type TrackedLinkClickMeta = {
  userAgent?: string | null;
  referer?: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS project_tracked_links (
  token             TEXT PRIMARY KEY,
  job_slug          TEXT NOT NULL,
  contact_uid       TEXT NOT NULL,
  destination       TEXT NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by           TEXT,
  channel           TEXT NOT NULL DEFAULT 'share',
  click_count       INT NOT NULL DEFAULT 0,
  first_clicked_at  TIMESTAMPTZ,
  last_clicked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS project_tracked_links_job_idx
  ON project_tracked_links (job_slug, sent_at DESC);
`;

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE_PATH = join(__dirname, '..', 'knowledge', 'tracked-links.json');
const MAX_FILE_LINKS = 2000;

let _pool: pg.Pool | null | undefined = undefined;
let _schemaReady: Promise<void> | null = null;

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
    _schemaReady = pool.query(SCHEMA_SQL).catch((e) => {
      _schemaReady = null;
      throw e;
    }) as Promise<void>;
  }
  await _schemaReady;
  return pool;
}

function readFileLinks(): TrackedLinkRecord[] {
  try {
    if (!existsSync(FILE_PATH)) return [];
    const raw = readFileSync(FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TrackedLinkRecord[]) : [];
  } catch {
    return [];
  }
}

function writeFileLinks(links: TrackedLinkRecord[]): void {
  mkdirSync(dirname(FILE_PATH), { recursive: true });
  writeFileSync(FILE_PATH, JSON.stringify(links.slice(0, MAX_FILE_LINKS), null, 2), 'utf8');
}

function rowToRecord(row: {
  token: string;
  job_slug: string;
  contact_uid: string;
  destination: string;
  sent_at: Date | string;
  sent_by: string | null;
  channel: string;
  click_count: number;
  first_clicked_at: Date | string | null;
  last_clicked_at: Date | string | null;
}): TrackedLinkRecord {
  return {
    token: row.token,
    job_slug: row.job_slug,
    contact_uid: row.contact_uid,
    destination: row.destination,
    sent_at: new Date(row.sent_at).toISOString(),
    sent_by: row.sent_by,
    channel: row.channel as TrackedLinkChannel,
    click_count: row.click_count,
    first_clicked_at: row.first_clicked_at ? new Date(row.first_clicked_at).toISOString() : null,
    last_clicked_at: row.last_clicked_at ? new Date(row.last_clicked_at).toISOString() : null,
  };
}

/** Generate a URL-safe token whose prefix encodes the send timestamp (base36 ms). */
export function generateLinkToken(sentAt: Date = new Date()): string {
  const ts = sentAt.getTime().toString(36);
  const rand = randomBytes(3).toString('hex');
  return `${ts}-${rand}`;
}

/** Decode send time from token prefix (works without DB lookup). */
export function decodeLinkTokenSentAt(token: string): Date | null {
  const m = /^([a-z0-9]+)-/i.exec(token.trim());
  if (!m) return null;
  const ms = parseInt(m[1]!, 36);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function trackedLinkUrl(token: string, request?: Request): string {
  return `${siteBaseUrl(request)}/go/${encodeURIComponent(token)}`;
}

export async function createTrackedProjectLink(input: {
  jobSlug: string;
  contactUid: string;
  destination?: string;
  tab?: string;
  channel?: TrackedLinkChannel;
  sentBy?: string | null;
  request?: Request;
}): Promise<{ ok: true; link: TrackedLinkRecord; url: string } | { ok: false; error: string }> {
  const jobSlug = input.jobSlug.trim();
  const contactUid = input.contactUid.trim();
  if (!jobSlug || !contactUid) return { ok: false, error: 'jobSlug and contactUid are required' };

  const sentAt = new Date();
  const token = generateLinkToken(sentAt);
  const destination =
    input.destination?.trim() ||
    clientPortalUrl(contactUid, input.tab?.trim() ? { tab: input.tab.trim() } : undefined);
  const channel = input.channel ?? 'share';
  const sentBy = input.sentBy?.trim() || null;

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `INSERT INTO project_tracked_links
        (token, job_slug, contact_uid, destination, sent_at, sent_by, channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING token, job_slug, contact_uid, destination, sent_at, sent_by, channel,
                 click_count, first_clicked_at, last_clicked_at`,
      [token, jobSlug, contactUid, destination, sentAt.toISOString(), sentBy, channel],
    );
    const link = rowToRecord(res.rows[0]);
    return { ok: true, link, url: trackedLinkUrl(token, input.request) };
  }

  const link: TrackedLinkRecord = {
    token,
    job_slug: jobSlug,
    contact_uid: contactUid,
    destination,
    sent_at: sentAt.toISOString(),
    sent_by: sentBy,
    channel,
    click_count: 0,
    first_clicked_at: null,
    last_clicked_at: null,
  };
  const links = readFileLinks();
  links.unshift(link);
  writeFileLinks(links);
  return { ok: true, link, url: trackedLinkUrl(token, input.request) };
}

export async function getTrackedLink(token: string): Promise<TrackedLinkRecord | null> {
  const id = token.trim();
  if (!id) return null;

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `SELECT token, job_slug, contact_uid, destination, sent_at, sent_by, channel,
              click_count, first_clicked_at, last_clicked_at
       FROM project_tracked_links WHERE token = $1`,
      [id],
    );
    if (!res.rows[0]) return null;
    return rowToRecord(res.rows[0]);
  }

  return readFileLinks().find((l) => l.token === id) ?? null;
}

export async function recordTrackedLinkClick(
  token: string,
  meta?: TrackedLinkClickMeta,
): Promise<TrackedLinkRecord | null> {
  const id = token.trim();
  if (!id) return null;
  void meta;

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `UPDATE project_tracked_links
       SET click_count = click_count + 1,
           first_clicked_at = COALESCE(first_clicked_at, now()),
           last_clicked_at = now()
       WHERE token = $1
       RETURNING token, job_slug, contact_uid, destination, sent_at, sent_by, channel,
                 click_count, first_clicked_at, last_clicked_at`,
      [id],
    );
    if (!res.rows[0]) return null;
    return rowToRecord(res.rows[0]);
  }

  const links = readFileLinks();
  const idx = links.findIndex((l) => l.token === id);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  const row = links[idx]!;
  row.click_count += 1;
  if (!row.first_clicked_at) row.first_clicked_at = now;
  row.last_clicked_at = now;
  links[idx] = row;
  writeFileLinks(links);
  return row;
}

export async function listTrackedLinksForJob(
  jobSlug: string,
  opts?: { limit?: number },
): Promise<TrackedLinkRecord[]> {
  const slug = jobSlug.trim();
  if (!slug) return [];
  const limit = Math.min(Math.max(opts?.limit ?? 10, 1), 50);

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `SELECT token, job_slug, contact_uid, destination, sent_at, sent_by, channel,
              click_count, first_clicked_at, last_clicked_at
       FROM project_tracked_links
       WHERE job_slug = $1
       ORDER BY sent_at DESC
       LIMIT $2`,
      [slug, limit],
    );
    return res.rows.map(rowToRecord);
  }

  return readFileLinks().filter((l) => l.job_slug === slug).slice(0, limit);
}
