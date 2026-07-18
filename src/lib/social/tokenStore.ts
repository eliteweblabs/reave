/**
 * Persist social OAuth tokens.
 *
 * Postgres (DATABASE_URL) when available, else a local JSON file that is
 * git-ignored (tokens are secrets — never commit them). Access/refresh tokens
 * are never returned to the browser; only connection status is exposed via
 * `listConnections()`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { serverEnv } from '../serverEnv.ts';
import type { SocialPlatformId } from './types.ts';

export interface StoredSocialToken {
  platform: SocialPlatformId;
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  /** ISO timestamp when the access token expires, if known. */
  expiresAt: string | null;
  /** Optional human label for the connected account (@handle / page name). */
  accountLabel: string | null;
  connectedAt: string;
}

export interface SocialConnectionStatus {
  platform: SocialPlatformId;
  connected: boolean;
  accountLabel: string | null;
  scope: string | null;
  connectedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS social_tokens (
  platform       TEXT PRIMARY KEY,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT,
  scope          TEXT,
  expires_at     TIMESTAMPTZ,
  account_label  TEXT,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

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
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 3 });
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

function usePostgres(): boolean {
  return Boolean(databaseUrl());
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

function filePath(): string {
  const override = serverEnv('SOCIAL_TOKENS_FILE')?.trim();
  if (override) return override;
  return join(projectRoot(), 'src', 'knowledge', 'social-tokens.json');
}

function readFileTokens(): Record<string, StoredSocialToken> {
  try {
    const path = filePath();
    if (!existsSync(path)) return {};
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return raw && typeof raw === 'object' ? (raw as Record<string, StoredSocialToken>) : {};
  } catch {
    return {};
  }
}

function writeFileTokens(tokens: Record<string, StoredSocialToken>): boolean {
  try {
    const path = filePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(tokens, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[social-tokens] file write failed', e);
    return false;
  }
}

export interface SetTokenInput {
  platform: SocialPlatformId;
  accessToken: string;
  refreshToken?: string | null;
  scope?: string | null;
  expiresAt?: string | null;
  accountLabel?: string | null;
}

export async function setSocialToken(input: SetTokenInput): Promise<boolean> {
  const record: StoredSocialToken = {
    platform: input.platform,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? null,
    scope: input.scope ?? null,
    expiresAt: input.expiresAt ?? null,
    accountLabel: input.accountLabel ?? null,
    connectedAt: new Date().toISOString(),
  };

  if (usePostgres()) {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(
      `INSERT INTO social_tokens (platform, access_token, refresh_token, scope, expires_at, account_label, connected_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (platform) DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         scope = EXCLUDED.scope,
         expires_at = EXCLUDED.expires_at,
         account_label = EXCLUDED.account_label,
         connected_at = now()`,
      [
        record.platform,
        record.accessToken,
        record.refreshToken,
        record.scope,
        record.expiresAt ? new Date(record.expiresAt) : null,
        record.accountLabel,
      ],
    );
    return true;
  }

  const all = readFileTokens();
  all[record.platform] = record;
  return writeFileTokens(all);
}

export async function getSocialToken(platform: SocialPlatformId): Promise<StoredSocialToken | null> {
  if (usePostgres()) {
    const pool = await ensureSchema();
    if (!pool) return null;
    const res = await pool.query<{
      platform: string;
      access_token: string;
      refresh_token: string | null;
      scope: string | null;
      expires_at: Date | string | null;
      account_label: string | null;
      connected_at: Date | string | null;
    }>(`SELECT * FROM social_tokens WHERE platform = $1 LIMIT 1`, [platform]);
    const row = res.rows[0];
    if (!row) return null;
    return {
      platform: row.platform as SocialPlatformId,
      accessToken: row.access_token,
      refreshToken: row.refresh_token,
      scope: row.scope,
      expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
      accountLabel: row.account_label,
      connectedAt: row.connected_at ? new Date(row.connected_at).toISOString() : new Date().toISOString(),
    };
  }

  return readFileTokens()[platform] ?? null;
}

export async function deleteSocialToken(platform: SocialPlatformId): Promise<boolean> {
  if (usePostgres()) {
    const pool = await ensureSchema();
    if (!pool) return false;
    await pool.query(`DELETE FROM social_tokens WHERE platform = $1`, [platform]);
    return true;
  }
  const all = readFileTokens();
  if (!(platform in all)) return true;
  delete all[platform];
  return writeFileTokens(all);
}

function toStatus(token: StoredSocialToken | null, platform: SocialPlatformId): SocialConnectionStatus {
  if (!token) {
    return {
      platform,
      connected: false,
      accountLabel: null,
      scope: null,
      connectedAt: null,
      expiresAt: null,
      expired: false,
    };
  }
  const expired = token.expiresAt ? new Date(token.expiresAt).getTime() < Date.now() : false;
  return {
    platform,
    connected: true,
    accountLabel: token.accountLabel,
    scope: token.scope,
    connectedAt: token.connectedAt,
    expiresAt: token.expiresAt,
    expired,
  };
}

/** Connection status for a set of platforms — never exposes raw tokens. */
export async function listConnections(
  platforms: SocialPlatformId[],
): Promise<SocialConnectionStatus[]> {
  const out: SocialConnectionStatus[] = [];
  for (const platform of platforms) {
    const token = await getSocialToken(platform).catch(() => null);
    out.push(toStatus(token, platform));
  }
  return out;
}
