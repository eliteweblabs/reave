/**
 * Reviews triage — Postgres store for fetched reviews + response workflow.
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
import { getPgPool } from './pgPool';

export const REVIEW_PLATFORMS = [
  'google',
  'apple',
  'yelp',
  'facebook',
  'tripadvisor',
  'trustpilot',
  'glassdoor',
  'other',
] as const;
export type ReviewPlatform = (typeof REVIEW_PLATFORMS)[number];

export const REVIEW_STATUSES = ['new', 'todo', 'responded', 'dismissed'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export type OnlineReview = {
  id: string;
  platform: ReviewPlatform;
  externalId: string | null;
  authorName: string | null;
  rating: number | null;
  reviewText: string | null;
  reviewUrl: string | null;
  reviewedAt: string | null;
  status: ReviewStatus;
  responseDraft: string | null;
  responseText: string | null;
  respondedAt: string | null;
  notes: string | null;
  fetchedAt: string;
  updatedAt: string;
};

export type OnlineReviewsConfig = {
  googlePlaceId: string | null;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  updatedAt: string | null;
};

export type UpsertReviewInput = {
  platform: ReviewPlatform;
  externalId?: string | null;
  authorName?: string | null;
  rating?: number | null;
  reviewText?: string | null;
  reviewUrl?: string | null;
  reviewedAt?: string | null;
  status?: ReviewStatus;
};

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS online_reviews_config (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  google_place_id  TEXT,
  sync_enabled     BOOLEAN NOT NULL DEFAULT true,
  last_sync_at     TIMESTAMPTZ,
  last_sync_error  TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS online_reviews (
  id               UUID PRIMARY KEY,
  platform         TEXT NOT NULL
    CHECK (platform IN ('google', 'apple', 'yelp', 'facebook', 'tripadvisor', 'trustpilot', 'glassdoor', 'other')),
  external_id      TEXT,
  author_name      TEXT,
  rating           NUMERIC(2, 1),
  review_text      TEXT,
  review_url       TEXT,
  reviewed_at      TIMESTAMPTZ,
  status           TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'todo', 'responded', 'dismissed')),
  response_draft   TEXT,
  response_text    TEXT,
  responded_at     TIMESTAMPTZ,
  notes            TEXT,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

CREATE INDEX IF NOT EXISTS idx_online_reviews_status ON online_reviews (status, reviewed_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_online_reviews_platform ON online_reviews (platform, reviewed_at DESC NULLS LAST);

ALTER TABLE online_reviews DROP CONSTRAINT IF EXISTS online_reviews_platform_check;
ALTER TABLE online_reviews ADD CONSTRAINT online_reviews_platform_check
  CHECK (platform IN ('google', 'apple', 'yelp', 'facebook', 'tripadvisor', 'trustpilot', 'glassdoor', 'other'));
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

function rowToReview(row: pg.QueryResultRow): OnlineReview {
  return {
    id: String(row.id),
    platform: row.platform as ReviewPlatform,
    externalId: row.external_id ?? null,
    authorName: row.author_name ?? null,
    rating: row.rating != null ? Number(row.rating) : null,
    reviewText: row.review_text ?? null,
    reviewUrl: row.review_url ?? null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    status: row.status as ReviewStatus,
    responseDraft: row.response_draft ?? null,
    responseText: row.response_text ?? null,
    respondedAt: row.responded_at ? new Date(row.responded_at).toISOString() : null,
    notes: row.notes ?? null,
    fetchedAt: new Date(row.fetched_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export function normalizeReviewPlatform(raw: unknown): ReviewPlatform | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  return REVIEW_PLATFORMS.includes(v as ReviewPlatform) ? (v as ReviewPlatform) : undefined;
}

export function normalizeReviewStatus(raw: unknown): ReviewStatus | undefined {
  const v = String(raw ?? '').trim().toLowerCase();
  return REVIEW_STATUSES.includes(v as ReviewStatus) ? (v as ReviewStatus) : undefined;
}

export async function getOnlineReviewsConfig(): Promise<OnlineReviewsConfig> {
  const pool = await ensureSchema();
  if (!pool) {
    return {
      googlePlaceId: null,
      syncEnabled: true,
      lastSyncAt: null,
      lastSyncError: null,
      updatedAt: null,
    };
  }

  await pool.query(
    `INSERT INTO online_reviews_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  );

  const { rows } = await pool.query(
    `SELECT google_place_id, sync_enabled, last_sync_at, last_sync_error, updated_at
     FROM online_reviews_config WHERE id = 1`,
  );
  const row = rows[0];
  if (!row) {
    return {
      googlePlaceId: null,
      syncEnabled: true,
      lastSyncAt: null,
      lastSyncError: null,
      updatedAt: null,
    };
  }

  return {
    googlePlaceId: row.google_place_id ?? null,
    syncEnabled: row.sync_enabled !== false,
    lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at).toISOString() : null,
    lastSyncError: row.last_sync_error ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

export async function saveOnlineReviewsConfig(
  patch: Partial<Pick<OnlineReviewsConfig, 'googlePlaceId' | 'syncEnabled'>>,
): Promise<OnlineReviewsConfig> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('Database not configured');

  await pool.query(`INSERT INTO online_reviews_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);

  const current = await getOnlineReviewsConfig();
  const googlePlaceId =
    patch.googlePlaceId !== undefined ? patch.googlePlaceId?.trim() || null : current.googlePlaceId;
  const syncEnabled = patch.syncEnabled !== undefined ? patch.syncEnabled : current.syncEnabled;

  await pool.query(
    `UPDATE online_reviews_config
     SET google_place_id = $1, sync_enabled = $2, updated_at = now()
     WHERE id = 1`,
    [googlePlaceId, syncEnabled],
  );

  return getOnlineReviewsConfig();
}

export async function recordSyncResult(error: string | null): Promise<void> {
  const pool = await ensureSchema();
  if (!pool) return;

  await pool.query(
    `UPDATE online_reviews_config
     SET last_sync_at = now(),
         last_sync_error = $1,
         updated_at = now()
     WHERE id = 1`,
    [error],
  );
}

export type ListReviewsFilter = {
  status?: ReviewStatus | 'inbox';
  platform?: ReviewPlatform;
  limit?: number;
};

export async function listOnlineReviews(filter: ListReviewsFilter = {}): Promise<OnlineReview[]> {
  const pool = await ensureSchema();
  if (!pool) return [];

  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filter.status === 'inbox') {
    clauses.push(`status IN ('new', 'todo')`);
  } else if (filter.status) {
    clauses.push(`status = $${i++}`);
    params.push(filter.status);
  }

  if (filter.platform) {
    clauses.push(`platform = $${i++}`);
    params.push(filter.platform);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 500);

  const { rows } = await pool.query(
    `SELECT * FROM online_reviews ${where}
     ORDER BY
       CASE status WHEN 'new' THEN 0 WHEN 'todo' THEN 1 WHEN 'responded' THEN 2 ELSE 3 END,
       reviewed_at DESC NULLS LAST,
       fetched_at DESC
     LIMIT $${i}`,
    [...params, limit],
  );

  return rows.map(rowToReview);
}

export async function getOnlineReview(id: string): Promise<OnlineReview | null> {
  const pool = await ensureSchema();
  if (!pool) return null;

  const { rows } = await pool.query(`SELECT * FROM online_reviews WHERE id = $1`, [id]);
  return rows[0] ? rowToReview(rows[0]) : null;
}

export async function upsertOnlineReview(input: UpsertReviewInput): Promise<OnlineReview> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('Database not configured');

  const externalId = input.externalId?.trim() || null;

  if (externalId) {
    const { rows } = await pool.query(
      `SELECT id, status FROM online_reviews WHERE platform = $1 AND external_id = $2`,
      [input.platform, externalId],
    );
    if (rows[0]) {
      const { rows: updated } = await pool.query(
        `UPDATE online_reviews SET
           author_name = COALESCE($2, author_name),
           rating = COALESCE($3, rating),
           review_text = COALESCE($4, review_text),
           review_url = COALESCE($5, review_url),
           reviewed_at = COALESCE($6, reviewed_at),
           updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [
          rows[0].id,
          input.authorName ?? null,
          input.rating ?? null,
          input.reviewText ?? null,
          input.reviewUrl ?? null,
          input.reviewedAt ?? null,
        ],
      );
      return rowToReview(updated[0]);
    }
  }

  const id = randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO online_reviews (
       id, platform, external_id, author_name, rating, review_text, review_url,
       reviewed_at, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      input.platform,
      externalId,
      input.authorName ?? null,
      input.rating ?? null,
      input.reviewText ?? null,
      input.reviewUrl ?? null,
      input.reviewedAt ?? null,
      input.status ?? 'new',
    ],
  );
  return rowToReview(rows[0]);
}

export async function createManualReview(input: {
  platform: ReviewPlatform;
  authorName?: string | null;
  rating?: number | null;
  reviewText?: string | null;
  reviewUrl?: string | null;
  reviewedAt?: string | null;
}): Promise<OnlineReview> {
  return upsertOnlineReview({ ...input, status: 'new' });
}

export async function updateOnlineReview(
  id: string,
  patch: {
    status?: ReviewStatus;
    responseDraft?: string | null;
    responseText?: string | null;
    notes?: string | null;
  },
): Promise<OnlineReview | null> {
  const pool = await ensureSchema();
  if (!pool) throw new Error('Database not configured');

  const current = await getOnlineReview(id);
  if (!current) return null;

  const status = patch.status ?? current.status;
  let respondedAt = current.respondedAt;
  if (patch.status === 'responded' && current.status !== 'responded') {
    respondedAt = new Date().toISOString();
  } else if (patch.status && patch.status !== 'responded') {
    respondedAt = null;
  }

  const { rows } = await pool.query(
    `UPDATE online_reviews SET
       status = $2,
       response_draft = COALESCE($3, response_draft),
       response_text = COALESCE($4, response_text),
       responded_at = $5,
       notes = COALESCE($6, notes),
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      status,
      patch.responseDraft !== undefined ? patch.responseDraft : current.responseDraft,
      patch.responseText !== undefined ? patch.responseText : current.responseText,
      respondedAt,
      patch.notes !== undefined ? patch.notes : current.notes,
    ],
  );

  return rows[0] ? rowToReview(rows[0]) : null;
}

export async function deleteOnlineReview(id: string): Promise<boolean> {
  const pool = await ensureSchema();
  if (!pool) return false;

  const { rowCount } = await pool.query(`DELETE FROM online_reviews WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function onlineReviewsSummary(): Promise<{
  inbox: number;
  todo: number;
  new: number;
  responded: number;
  dismissed: number;
  total: number;
}> {
  const pool = await ensureSchema();
  if (!pool) {
    return { inbox: 0, todo: 0, new: 0, responded: 0, dismissed: 0, total: 0 };
  }

  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM online_reviews GROUP BY status`,
  );

  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row.status)] = Number(row.count);

  const newCount = counts.new ?? 0;
  const todoCount = counts.todo ?? 0;

  return {
    inbox: newCount + todoCount,
    todo: todoCount,
    new: newCount,
    responded: counts.responded ?? 0,
    dismissed: counts.dismissed ?? 0,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
  };
}
