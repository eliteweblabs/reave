/**
 * Kap screen recordings — tokenized public view URLs at /r/:token.
 * Postgres when DATABASE_URL is set; otherwise JSON + base64 under WORK_DIR/.kap/.
 */

import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { getPgPool } from './pgPool';
import { siteBaseUrl } from './requestOrigin';
import { workDir } from './workStore';

export type KapRecordingSummary = {
  token: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
};

export type KapRecordingRecord = KapRecordingSummary & {
  dataBase64: string;
};

export const KAP_RECORDING_MAX_BYTES = 25 * 1024 * 1024;

const KAP_MEDIA_TYPES = new Set([
  'image/gif',
  'image/apng',
  'video/mp4',
  'video/webm',
]);

const TOKEN_RE = /^[a-zA-Z0-9_-]{8,64}$/;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS kap_recordings (
  token         TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  media_type    TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  data_base64   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS kap_recordings_created_idx ON kap_recordings (created_at DESC);
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

export function isKapRecordingMediaType(mediaType: string): boolean {
  return KAP_MEDIA_TYPES.has(mediaType.trim().toLowerCase());
}

export function isValidKapRecordingToken(token: string): boolean {
  return TOKEN_RE.test(token.trim());
}

/** URL-safe unguessable token — never expires. */
export function generateKapRecordingToken(): string {
  return randomBytes(18).toString('base64url');
}

export function kapRecordingViewUrl(token: string, request?: Request): string {
  return `${siteBaseUrl(request)}/r/${encodeURIComponent(token)}`;
}

function kapDir(): string {
  const dir = join(workDir(), '.kap');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function fileRecordPath(token: string): string {
  return join(kapDir(), `${token}.json`);
}

function normalizeRecord(raw: Record<string, unknown>): KapRecordingRecord | null {
  const token = String(raw.token ?? '').trim();
  const filename = String(raw.filename ?? '').trim();
  const mediaType = String(raw.mediaType ?? raw.media_type ?? '').trim().toLowerCase();
  const dataBase64 = String(raw.dataBase64 ?? raw.data_base64 ?? '').trim();
  if (!token || !filename || !mediaType || !dataBase64) return null;
  const sizeBytes = Number(raw.sizeBytes ?? raw.size_bytes ?? 0);
  const createdAtRaw = raw.createdAt ?? raw.created_at;
  const createdAt =
    typeof createdAtRaw === 'string' && createdAtRaw.trim()
      ? new Date(createdAtRaw).toISOString()
      : new Date().toISOString();
  return {
    token,
    filename,
    mediaType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    createdAt,
    dataBase64,
  };
}

export async function storeKapRecording(input: {
  filename?: string;
  mediaType: string;
  dataBase64: string;
  sizeBytes: number;
}): Promise<{ ok: true; record: KapRecordingSummary } | { ok: false; error: string }> {
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isKapRecordingMediaType(mediaType)) {
    return { ok: false, error: 'Unsupported media type' };
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > KAP_RECORDING_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${KAP_RECORDING_MAX_BYTES / (1024 * 1024)} MB)`,
    };
  }

  const token = generateKapRecordingToken();
  const filename = input.filename?.trim() || `recording-${token.slice(0, 8)}`;
  const createdAt = new Date().toISOString();

  const pool = await ensureSchema();
  if (pool) {
    await pool.query(
      `INSERT INTO kap_recordings (token, filename, media_type, size_bytes, data_base64, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [token, filename, mediaType, input.sizeBytes, input.dataBase64, createdAt],
    );
  } else {
    writeFileSync(
      fileRecordPath(token),
      JSON.stringify(
        {
          token,
          filename,
          mediaType,
          sizeBytes: input.sizeBytes,
          dataBase64: input.dataBase64,
          createdAt,
        },
        null,
        2,
      ),
    );
  }

  return {
    ok: true,
    record: { token, filename, mediaType, sizeBytes: input.sizeBytes, createdAt },
  };
}

export async function getKapRecording(token: string): Promise<KapRecordingRecord | null> {
  const id = token.trim();
  if (!isValidKapRecordingToken(id)) return null;

  const pool = await ensureSchema();
  if (pool) {
    const res = await pool.query(
      `SELECT token, filename, media_type, size_bytes, data_base64, created_at
       FROM kap_recordings WHERE token = $1`,
      [id],
    );
    const row = res.rows[0];
    if (!row) return null;
    return normalizeRecord({
      token: row.token,
      filename: row.filename,
      media_type: row.media_type,
      size_bytes: row.size_bytes,
      data_base64: row.data_base64,
      created_at: row.created_at,
    });
  }

  const path = fileRecordPath(id);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return normalizeRecord(raw);
  } catch {
    return null;
  }
}
