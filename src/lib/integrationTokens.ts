import { projectRoot } from './projectRoot';
/**
 * OAuth / API tokens keyed by (subject, provider).
 *
 * Subjects:
 *   - `agency` — install-wide (e.g. owner's Google Search Console + GA4)
 *   - `contact:{uid}` — per-client override
 *
 * Postgres when DATABASE_URL is set; otherwise a git-ignored local JSON file.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import { serverEnv } from './serverEnv.ts';

export type IntegrationSubject = 'agency' | `contact:${string}`;

export type IntegrationProvider =
  | 'google_webmaster'
  | 'bing_webmaster'
  | 'plausible_client';

export interface StoredIntegrationToken {
  subject: IntegrationSubject;
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresAt: string | null;
  accountLabel: string | null;
  /** Extra JSON (e.g. default GA4 property id, Plausible site id). */
  meta: Record<string, unknown> | null;
  connectedAt: string;
}

export interface IntegrationConnectionStatus {
  subject: IntegrationSubject;
  provider: IntegrationProvider;
  connected: boolean;
  accountLabel: string | null;
  scope: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  meta: Record<string, unknown> | null;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS integration_tokens (
  subject        TEXT NOT NULL,
  provider       TEXT NOT NULL,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,
  scope          TEXT,
  expires_at     TIMESTAMPTZ,
  account_label  TEXT,
  meta           JSONB,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (subject, provider)
);
`;

let _schemaReady: Promise<void> | null = null;

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

function usePostgres(): boolean {
  return Boolean(databaseUrl());
}


function filePath(): string {
  const override = serverEnv('INTEGRATION_TOKENS_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'integration-tokens.json');
}

type FileStore = Record<string, StoredIntegrationToken>;

function fileKey(subject: string, provider: string): string {
  return `${subject}::${provider}`;
}

function readFileTokens(): FileStore {
  try {
    const path = filePath();
    if (!existsSync(path)) return {};
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return raw && typeof raw === 'object' ? (raw as FileStore) : {};
  } catch {
    return {};
  }
}

function writeFileTokens(tokens: FileStore): boolean {
  try {
    const path = filePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[integration-tokens] file write failed', e);
    return false;
  }
}

export function agencySubject(): IntegrationSubject {
  return 'agency';
}

export function contactSubject(uid: string): IntegrationSubject {
  return `contact:${uid.trim()}`;
}

export function parseContactSubject(subject: IntegrationSubject): string | null {
  if (!subject.startsWith('contact:')) return null;
  const uid = subject.slice('contact:'.length).trim();
  return uid || null;
}

function rowToToken(row: {
  subject: string;
  provider: string;
  access_token: string;
  refresh_token: string | null;
  scope: string | null;
  expires_at: Date | string | null;
  account_label: string | null;
  meta: unknown;
  connected_at: Date | string | null;
}): StoredIntegrationToken {
  let meta: Record<string, unknown> | null = null;
  if (row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)) {
    meta = row.meta as Record<string, unknown>;
  }
  return {
    subject: row.subject as IntegrationSubject,
    provider: row.provider as IntegrationProvider,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    scope: row.scope,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    accountLabel: row.account_label,
    meta,
    connectedAt: row.connected_at
      ? new Date(row.connected_at).toISOString()
      : new Date().toISOString(),
  };
}

export interface SetIntegrationTokenInput {
  subject: IntegrationSubject;
  provider: IntegrationProvider;
  accessToken: string;
  refreshToken?: string | null;
  scope?: string | null;
  expiresAt?: string | null;
  accountLabel?: string | null;
  meta?: Record<string, unknown> | null;
}

export async function setIntegrationToken(input: SetIntegrationTokenInput): Promise<boolean> {
  const record: StoredIntegrationToken = {
    subject: input.subject,
    provider: input.provider,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    scope: input.scope ?? null,
    expiresAt: input.expiresAt ?? null,
    accountLabel: input.accountLabel ?? null,
    meta: input.meta ?? null,
    connectedAt: new Date().toISOString(),
  };

  if (usePostgres()) {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO integration_tokens
         (subject, provider, access_token, refresh_token, scope, expires_at, account_label, meta, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (subject, provider) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, integration_tokens.refresh_token),
         scope = EXCLUDED.scope,
         expires_at = EXCLUDED.expires_at,
         account_label = COALESCE(EXCLUDED.account_label, integration_tokens.account_label),
         meta = COALESCE(EXCLUDED.meta, integration_tokens.meta),
         connected_at = now()`,
      [
        record.subject,
        record.provider,
        record.accessToken,
        record.refreshToken,
        record.scope,
        record.expiresAt ? new Date(record.expiresAt) : null,
        record.accountLabel,
        record.meta ? JSON.stringify(record.meta) : null,
      ],
    );
    return true;
  }

  const all = readFileTokens();
  all[fileKey(record.subject, record.provider)] = record;
  return writeFileTokens(all);
}

export async function getIntegrationToken(
  subject: IntegrationSubject,
  provider: IntegrationProvider,
): Promise<StoredIntegrationToken | null> {
  if (usePostgres()) {
    const pool = await ensureSchema();
    if (!pool) return null;
    const res = await pool.query(
      `SELECT * FROM integration_tokens WHERE subject = $1 AND provider = $2 LIMIT 1`,
      [subject, provider],
    );
    const row = res.rows[0];
    if (!row) return null;
    return rowToToken(row);
  }
  return readFileTokens()[fileKey(subject, provider)] ?? null;
}

export async function deleteIntegrationToken(
  subject: IntegrationSubject,
  provider: IntegrationProvider,
): Promise<boolean> {
  if (usePostgres()) {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(`DELETE FROM integration_tokens WHERE subject = $1 AND provider = $2`, [
      subject,
      provider,
    ]);
    return true;
  }
  const all = readFileTokens();
  const key = fileKey(subject, provider);
  if (!(key in all)) return true;
  delete all[key];
  return writeFileTokens(all);
}

export function toIntegrationStatus(
  token: StoredIntegrationToken | null,
  subject: IntegrationSubject,
  provider: IntegrationProvider,
): IntegrationConnectionStatus {
  if (!token) {
    return {
      subject,
      provider,
      connected: false,
      accountLabel: null,
      scope: null,
      connectedAt: null,
      expiresAt: null,
      expired: false,
      meta: null,
    };
  }
  const expired = token.expiresAt ? new Date(token.expiresAt).getTime() < Date.now() : false;
  return {
    subject,
    provider,
    connected: true,
    accountLabel: token.accountLabel,
    scope: token.scope,
    connectedAt: token.connectedAt,
    expiresAt: token.expiresAt,
    expired,
    meta: token.meta,
  };
}
