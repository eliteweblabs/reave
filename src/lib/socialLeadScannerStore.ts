/**
 * Agentic Social Lead Scanner — keyword config, matched hits, and run history.
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
import { getPgPool } from './pgPool';
import type { SocialPlatformId } from './social/types';
import type { SocialActivityStatus } from './social/activityStore';

export const SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS: SocialPlatformId[] = [
  'facebook',
  'instagram',
  'twitter',
  'linkedin',
  'reddit',
  'bluesky',
  'threads',
];

export type SocialLeadScannerConfig = {
  enabled: boolean;
  keywords: string[];
  platforms: SocialPlatformId[];
  autoDraft: boolean;
  lastRunAt: string | null;
  lastRunError: string | null;
  lastRunNote: string | null;
  updatedAt: string | null;
};

export type SocialLeadScannerHit = {
  id: string;
  platform: SocialPlatformId;
  externalId: string | null;
  authorName: string;
  authorHandle: string;
  text: string;
  url: string | null;
  keywordMatched: string;
  status: SocialActivityStatus;
  replyDraft: string;
  detectedAt: string;
  updatedAt: string;
};

export type UpsertSocialLeadHitInput = {
  platform: SocialPlatformId;
  externalId?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  text: string;
  url?: string | null;
  keywordMatched: string;
  replyDraft?: string | null;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS social_lead_scanner_config (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled          BOOLEAN NOT NULL DEFAULT false,
  keywords         JSONB NOT NULL DEFAULT '[]'::jsonb,
  platforms        JSONB NOT NULL DEFAULT '[]'::jsonb,
  auto_draft       BOOLEAN NOT NULL DEFAULT true,
  last_run_at      TIMESTAMPTZ,
  last_run_error   TEXT,
  last_run_note    TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS social_lead_scanner_hits (
  id               UUID PRIMARY KEY,
  platform         TEXT NOT NULL,
  external_id      TEXT,
  author_name      TEXT,
  author_handle    TEXT,
  text             TEXT NOT NULL,
  url              TEXT,
  keyword_matched  TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'todo', 'responded', 'dismissed')),
  reply_draft      TEXT,
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_social_lead_scanner_hits_status
  ON social_lead_scanner_hits (status, detected_at DESC);
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

function parsePlatformList(raw: unknown): SocialPlatformId[] {
  if (!Array.isArray(raw)) return [...SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS];
  const out: SocialPlatformId[] = [];
  for (const item of raw) {
    const v = String(item ?? '').trim();
    if (v && !out.includes(v as SocialPlatformId)) out.push(v as SocialPlatformId);
  }
  return out.length ? out : [...SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS];
}

export function parseSocialLeadKeywords(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    const out: string[] = [];
    for (const item of raw) {
      const v = String(item ?? '').trim().toLowerCase();
      if (v && !out.includes(v)) out.push(v);
    }
    return out;
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\n,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .filter((v, i, arr) => arr.indexOf(v) === i);
  }
  return [];
}

function rowToHit(row: pg.QueryResultRow): SocialLeadScannerHit {
  return {
    id: String(row.id),
    platform: row.platform as SocialPlatformId,
    externalId: row.external_id ?? null,
    authorName: row.author_name ?? 'Unknown',
    authorHandle: row.author_handle ?? '',
    text: row.text ?? '',
    url: row.url ?? null,
    keywordMatched: row.keyword_matched ?? '',
    status: (row.status as SocialActivityStatus) || 'new',
    replyDraft: row.reply_draft ?? '',
    detectedAt: new Date(row.detected_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getSocialLeadScannerConfig(): Promise<SocialLeadScannerConfig> {
  const pool = await ensureSchema();
  if (!pool) {
    return {
      enabled: false,
      keywords: [],
      platforms: [...SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS],
      autoDraft: true,
      lastRunAt: null,
      lastRunError: null,
      lastRunNote: null,
      updatedAt: null,
    };
  }

  await pool.query(
    `INSERT INTO social_lead_scanner_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );

  const { rows } = await pool.query(
    `SELECT enabled, keywords, platforms, auto_draft, last_run_at, last_run_error, last_run_note, updated_at
     FROM social_lead_scanner_config WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) {
    return {
      enabled: false,
      keywords: [],
      platforms: [...SOCIAL_LEAD_SCANNER_DEFAULT_PLATFORMS],
      autoDraft: true,
      lastRunAt: null,
      lastRunError: null,
      lastRunNote: null,
      updatedAt: null,
    };
  }

  return {
    enabled: row.enabled === true,
    keywords: parseSocialLeadKeywords(row.keywords),
    platforms: parsePlatformList(row.platforms),
    autoDraft: row.auto_draft !== false,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at).toISOString() : null,
    lastRunError: row.last_run_error ?? null,
    lastRunNote: row.last_run_note ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function saveSocialLeadScannerConfig(
  patch: Partial<Pick<SocialLeadScannerConfig, 'enabled' | 'keywords' | 'platforms' | 'autoDraft'>>,
): Promise<SocialLeadScannerConfig> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('Database not configured');

  await pool.query(
    `INSERT INTO social_lead_scanner_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );
  const current = await getSocialLeadScannerConfig();

  const enabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
  const keywords =
    patch.keywords !== undefined ? parseSocialLeadKeywords(patch.keywords) : current.keywords;
  const platforms =
    patch.platforms !== undefined ? parsePlatformList(patch.platforms) : current.platforms;
  const autoDraft = patch.autoDraft !== undefined ? patch.autoDraft : current.autoDraft;

  await pool.query(
    `UPDATE social_lead_scanner_config
     SET enabled = $1, keywords = $2::jsonb, platforms = $3::jsonb, auto_draft = $4, updated_at = now()
     WHERE id = 1`,
    [enabled, JSON.stringify(keywords), JSON.stringify(platforms), autoDraft],
  );

  return getSocialLeadScannerConfig();
}

export async function recordSocialLeadScannerRun(input: {
  error?: string | null;
  note?: string | null;
}): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;

  await pool.query(
    `UPDATE social_lead_scanner_config
     SET last_run_at = now(),
         last_run_error = $1,
         last_run_note = $2,
         updated_at = now()
     WHERE id = 1`,
    [input.error ?? null, input.note ?? null],
  );
}

export async function listSocialLeadScannerHits(options?: {
  status?: SocialActivityStatus | 'inbox';
  limit?: number;
}): Promise<SocialLeadScannerHit[]> {
  const pool = await ensureSchema();
  if (!pool) return [];

  const limit = Math.min(Math.max(Number(options?.limit) || 100, 1), 500);
  const status = options?.status;
  let where = '';
  const params: unknown[] = [limit];

  if (status === 'inbox') {
    where = `WHERE status IN ('new', 'todo')`;
  } else if (status) {
    where = `WHERE status = $2`;
    params.unshift(status);
    params[1] = limit;
  }

  const { rows } = await pool.query(
    `SELECT * FROM social_lead_scanner_hits ${where}
     ORDER BY detected_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(rowToHit);
}

export async function upsertSocialLeadScannerHit(
  input: UpsertSocialLeadHitInput,
): Promise<SocialLeadScannerHit | null> {
  const pool = await ensureSchema();
  if (!pool) return null;

  const externalId = input.externalId?.trim() || null;
  const id = randomUUID();

  if (externalId) {
    const { rows: existing } = await pool.query(
      `SELECT id FROM social_lead_scanner_hits WHERE platform = $1 AND external_id = $2`,
      [input.platform, externalId],
    );
    if (existing[0]) {
      const { rows } = await pool.query(
        `UPDATE social_lead_scanner_hits SET
           text = $1,
           url = COALESCE($2, url),
           keyword_matched = $3,
           author_name = COALESCE($4, author_name),
           author_handle = COALESCE($5, author_handle),
           reply_draft = COALESCE($6, reply_draft),
           updated_at = now()
         WHERE id = $7
         RETURNING *`,
        [
          input.text,
          input.url ?? null,
          input.keywordMatched,
          input.authorName ?? null,
          input.authorHandle ?? null,
          input.replyDraft ?? null,
          existing[0].id,
        ],
      );
      return rows[0] ? rowToHit(rows[0]) : null;
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO social_lead_scanner_hits (
       id, platform, external_id, author_name, author_handle, text, url, keyword_matched, reply_draft
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      input.platform,
      externalId,
      input.authorName ?? 'Unknown',
      input.authorHandle ?? '',
      input.text,
      input.url ?? null,
      input.keywordMatched,
      input.replyDraft ?? null,
    ],
  );
  return rows[0] ? rowToHit(rows[0]) : null;
}

export async function updateSocialLeadScannerHit(
  id: string,
  patch: Partial<Pick<SocialLeadScannerHit, 'status' | 'replyDraft'>>,
): Promise<SocialLeadScannerHit | null> {
  const pool = await ensureSchema();
  if (!pool) return null;

  const { rows } = await pool.query(
    `UPDATE social_lead_scanner_hits SET
       status = COALESCE($2, status),
       reply_draft = COALESCE($3, reply_draft),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, patch.status ?? null, patch.replyDraft ?? null],
  );
  return rows[0] ? rowToHit(rows[0]) : null;
}

export async function socialLeadScannerSummary(): Promise<{ inbox: number; total: number }> {
  const pool = await ensureSchema();
  if (!pool) return { inbox: 0, total: 0 };

  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status IN ('new', 'todo'))::int AS inbox,
       COUNT(*)::int AS total
     FROM social_lead_scanner_hits`,
  );
  const row = rows[0];
  return {
    inbox: Number(row?.inbox ?? 0),
    total: Number(row?.total ?? 0),
  };
}

/** Return the first keyword that appears in text (case-insensitive). */
export function matchSocialLeadKeyword(text: string, keywords: string[]): string | null {
  const hay = String(text || '').toLowerCase();
  if (!hay || !keywords.length) return null;
  for (const kw of keywords) {
    const needle = kw.trim().toLowerCase();
    if (needle && hay.includes(needle)) return kw;
  }
  return null;
}
