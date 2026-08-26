/**
 * Admin media library — shared images and files for branding and content.
 * Postgres when DATABASE_URL is set; otherwise JSON + base64 under src/knowledge/.media/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import { databaseUrl, getPgPool } from './pgPool';
import {
  filenameForMediaType,
  projectFileResponseHeaders,
} from './projectFiles';
import { inferLogoUploadMediaType, isLogoUploadMediaType, LOGO_UPLOAD_MAX_BYTES } from './companyLogo';
import { BRAND_SVG_MAX_CHARS, sanitizeInlineSvg } from './brandSvg';
import { workDir } from './workStore';

export interface MediaLibrarySummary {
  id: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  altText: string | null;
  uploadedBy: string | null;
  createdAt: string;
  slug: string | null;
  url: string;
  thumbnailUrl: string;
  publicUrl: string;
}

export interface MediaLibraryRecord extends MediaLibrarySummary {
  dataBase64: string;
}

export const MEDIA_LIBRARY_MAX_BYTES = 10 * 1024 * 1024;

export const MEDIA_LIBRARY_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);

const IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
]);

export function isMediaLibraryMediaType(mediaType: string): boolean {
  return MEDIA_LIBRARY_MEDIA_TYPES.has(mediaType.trim().toLowerCase());
}

export function isMediaLibraryImageType(mediaType: string): boolean {
  return IMAGE_MEDIA_TYPES.has(mediaType.trim().toLowerCase());
}

export function isBrandSvgMediaType(mediaType: string): boolean {
  return mediaType.trim().toLowerCase() === 'image/svg+xml';
}

export function isBrandingApplyMediaType(mediaType: string): boolean {
  return isLogoUploadMediaType(mediaType) || isBrandSvgMediaType(mediaType);
}

/** Infer a library media type from a browser File or a WebDAV PUT. */
export function inferMediaLibraryType(file: { type?: string; name: string }): string | null {
  const type = (file.type || '').trim().toLowerCase();
  if (isMediaLibraryMediaType(type)) return type;
  const logoType = inferLogoUploadMediaType({
    type: file.type || '',
    name: file.name,
  });
  if (logoType) return logoType;
  const name = file.name.trim().toLowerCase();
  if (name.endsWith('.gif')) return 'image/gif';
  if (name.endsWith('.svg')) return 'image/svg+xml';
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.png')) return 'image/png';
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg';
  if (name.endsWith('.webp')) return 'image/webp';
  return null;
}

export function mediaLibraryUrl(id: string): string {
  return `/api/admin/media/${encodeURIComponent(id.trim())}`;
}

export function mediaLibraryThumbnailUrl(id: string): string {
  return `${mediaLibraryUrl(id)}?thumb=1`;
}

/** Public site URL for a library item — slug when set, otherwise the admin id. */
export function mediaPublicUrl(idOrSlug: string): string {
  return `/api/media/${encodeURIComponent(idOrSlug.trim())}`;
}

const SLUG_MAX = 80;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isMediaId(value: string): boolean {
  return UUID_RE.test(value.trim());
}

/** Stable public key: lowercase, hyphenated, no leading/trailing dashes. */
export function normalizeMediaSlug(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX);
}

export function slugFromFilename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, '').replace(/\.[a-z0-9]+$/i, '');
  return normalizeMediaSlug(base);
}

/** Suffix `-2`, `-3`, … when an auto-derived slug is already taken. */
export function uniqueMediaSlug(
  base: string,
  taken: (slug: string) => boolean,
  maxAttempts = 200,
): string {
  const root = normalizeMediaSlug(base);
  if (!root) return '';
  if (!taken(root)) return root;
  for (let n = 2; n <= maxAttempts; n++) {
    const suffix = `-${n}`;
    const next = `${root.slice(0, Math.max(1, SLUG_MAX - suffix.length))}${suffix}`;
    if (!taken(next)) return next;
  }
  const id = randomUUID().slice(0, 8);
  return `${root.slice(0, Math.max(1, SLUG_MAX - id.length - 1))}-${id}`;
}

function recordUrls(id: string, slug: string | null): Pick<MediaLibrarySummary, 'url' | 'thumbnailUrl' | 'publicUrl'> {
  return {
    url: mediaLibraryUrl(id),
    thumbnailUrl: mediaLibraryThumbnailUrl(id),
    publicUrl: mediaPublicUrl(slug || id),
  };
}

export { projectFileResponseHeaders };

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS media_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      TEXT NOT NULL,
  media_type    TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  data_base64   TEXT NOT NULL,
  alt_text      TEXT,
  uploaded_by   TEXT,
  slug          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_library_created_idx ON media_library (created_at DESC);
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS media_library_slug_uidx
  ON media_library (slug) WHERE slug IS NOT NULL AND btrim(slug) <> '';
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

export function isMediaLibraryDbConfigured(): boolean {
  return !!databaseUrl();
}

function mediaDir(): string {
  const dir = join(workDir(), '..', '.media');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function mediaRecordPath(id: string): string {
  return join(mediaDir(), `${id.trim()}.json`);
}

function normalizeSlugField(raw: unknown): string | null {
  const slug = normalizeMediaSlug(String(raw ?? ''));
  return slug || null;
}

function normalizeSummary(raw: Record<string, unknown>): MediaLibrarySummary | null {
  const id = String(raw.id ?? '').trim();
  const filename = String(raw.filename ?? '').trim();
  const mediaType = String(raw.mediaType ?? raw.media_type ?? '').trim().toLowerCase();
  if (!id || !filename || !mediaType) return null;
  const sizeBytes = Number(raw.sizeBytes ?? raw.size_bytes ?? 0);
  const slug = normalizeSlugField(raw.slug);
  return {
    id,
    filename,
    mediaType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    altText:
      raw.altText != null
        ? String(raw.altText)
        : raw.alt_text != null
          ? String(raw.alt_text)
          : null,
    uploadedBy:
      raw.uploadedBy != null
        ? String(raw.uploadedBy)
        : raw.uploaded_by != null
          ? String(raw.uploaded_by)
          : null,
    createdAt:
      String(raw.createdAt ?? raw.created_at ?? '').trim() || new Date().toISOString(),
    slug,
    ...recordUrls(id, slug),
  };
}

function fileListMedia(): MediaLibrarySummary[] {
  const dir = mediaDir();
  const out: MediaLibrarySummary[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      const summary = normalizeSummary(parsed);
      if (summary) out.push(summary);
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function fileGetMedia(id: string): MediaLibraryRecord | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  const path = mediaRecordPath(trimmed);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const summary = normalizeSummary(parsed);
    const dataBase64 = String(parsed.dataBase64 ?? parsed.data_base64 ?? '').trim();
    if (!summary || !dataBase64) return null;
    return { ...summary, dataBase64 };
  } catch {
    return null;
  }
}

function fileGetMediaBySlug(slug: string): MediaLibraryRecord | null {
  const wanted = normalizeMediaSlug(slug);
  if (!wanted) return null;
  for (const item of fileListMedia()) {
    if (item.slug === wanted) return fileGetMedia(item.id);
  }
  return null;
}

function fileAddMedia(input: {
  filename?: string;
  mediaType: string;
  dataBase64: string;
  altText?: string | null;
  uploadedBy?: string | null;
  slug?: string | null;
}): { ok: true; item: MediaLibrarySummary } | { ok: false; error: string } {
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isMediaLibraryMediaType(mediaType)) {
    return { ok: false, error: 'Unsupported file type' };
  }
  const dataBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!dataBase64) return { ok: false, error: 'Empty file data' };
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes < 1 || sizeBytes > MEDIA_LIBRARY_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)`,
    };
  }

  const id = randomUUID();
  const filename = input.filename?.trim() || filenameForMediaType(mediaType);
  const explicitSlug = normalizeSlugField(input.slug);
  let slug: string | null;
  if (explicitSlug) {
    if (fileGetMediaBySlug(explicitSlug)) {
      return { ok: false, error: 'Slug already in use' };
    }
    slug = explicitSlug;
  } else {
    const derived = slugFromFilename(filename);
    slug = derived
      ? uniqueMediaSlug(derived, (candidate) => Boolean(fileGetMediaBySlug(candidate))) || null
      : null;
  }
  const record: MediaLibraryRecord = {
    id,
    filename,
    mediaType,
    sizeBytes,
    altText: input.altText?.trim() || null,
    uploadedBy: input.uploadedBy?.trim() || null,
    createdAt: new Date().toISOString(),
    slug,
    ...recordUrls(id, slug),
    dataBase64,
  };
  writeFileSync(mediaRecordPath(id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const { dataBase64: _d, ...summary } = record;
  return { ok: true, item: summary };
}

function fileUpdateMedia(
  id: string,
  input: {
    mediaType: string;
    dataBase64: string;
    filename?: string;
  },
): { ok: true; item: MediaLibrarySummary } | { ok: false; error: string } {
  const existing = fileGetMedia(id);
  if (!existing) return { ok: false, error: 'Not found' };
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isMediaLibraryMediaType(mediaType)) {
    return { ok: false, error: 'Unsupported file type' };
  }
  const dataBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!dataBase64) return { ok: false, error: 'Empty file data' };
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes < 1 || sizeBytes > MEDIA_LIBRARY_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)`,
    };
  }
  const filename = input.filename?.trim() || existing.filename;
  const record: MediaLibraryRecord = {
    ...existing,
    filename,
    mediaType,
    sizeBytes,
    dataBase64,
    ...recordUrls(existing.id, existing.slug),
  };
  writeFileSync(mediaRecordPath(existing.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const { dataBase64: _d, ...summary } = record;
  return { ok: true, item: summary };
}

function fileDeleteMedia(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) return false;
  const path = mediaRecordPath(trimmed);
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

async function dbListMedia(limit = 200): Promise<MediaLibrarySummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const capped = Math.min(Math.max(1, limit), 500);
    const { rows } = await pool.query<{
      id: string;
      filename: string;
      media_type: string;
      size_bytes: string;
      alt_text: string | null;
      uploaded_by: string | null;
      created_at: string;
      slug: string | null;
    }>(
      `SELECT id, filename, media_type, size_bytes, alt_text, uploaded_by, created_at, slug
       FROM media_library ORDER BY created_at DESC LIMIT $1`,
      [capped],
    );
    return rows.map((row) => {
      const slug = normalizeSlugField(row.slug);
      return {
        id: row.id,
        filename: row.filename,
        mediaType: row.media_type,
        sizeBytes: Number(row.size_bytes),
        altText: row.alt_text,
        uploadedBy: row.uploaded_by,
        createdAt: row.created_at,
        slug,
        ...recordUrls(row.id, slug),
      };
    });
  } catch (e) {
    console.error('[media-library] list failed', e);
    return null;
  }
}

async function dbGetMedia(id: string): Promise<MediaLibraryRecord | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{
      id: string;
      filename: string;
      media_type: string;
      size_bytes: string;
      data_base64: string;
      alt_text: string | null;
      uploaded_by: string | null;
      created_at: string;
      slug: string | null;
    }>(
      `SELECT id, filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, created_at, slug
       FROM media_library WHERE id = $1`,
      [id.trim()],
    );
    const row = rows[0];
    if (!row) return null;
    const slug = normalizeSlugField(row.slug);
    return {
      id: row.id,
      filename: row.filename,
      mediaType: row.media_type,
      sizeBytes: Number(row.size_bytes),
      altText: row.alt_text,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      slug,
      ...recordUrls(row.id, slug),
      dataBase64: row.data_base64,
    };
  } catch (e) {
    console.error('[media-library] get failed', e);
    return null;
  }
}

async function dbGetMediaBySlug(slug: string): Promise<MediaLibraryRecord | null> {
  const wanted = normalizeMediaSlug(slug);
  if (!wanted) return null;
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{
      id: string;
      filename: string;
      media_type: string;
      size_bytes: string;
      data_base64: string;
      alt_text: string | null;
      uploaded_by: string | null;
      created_at: string;
      slug: string | null;
    }>(
      `SELECT id, filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, created_at, slug
       FROM media_library WHERE slug = $1`,
      [wanted],
    );
    const row = rows[0];
    if (!row) return null;
    const normalized = normalizeSlugField(row.slug);
    return {
      id: row.id,
      filename: row.filename,
      mediaType: row.media_type,
      sizeBytes: Number(row.size_bytes),
      altText: row.alt_text,
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
      slug: normalized,
      ...recordUrls(row.id, normalized),
      dataBase64: row.data_base64,
    };
  } catch (e) {
    console.error('[media-library] get-by-slug failed', e);
    return null;
  }
}

async function dbAddMedia(input: {
  filename?: string;
  mediaType: string;
  dataBase64: string;
  altText?: string | null;
  uploadedBy?: string | null;
  slug?: string | null;
}): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string } | null> {
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isMediaLibraryMediaType(mediaType)) {
    return { ok: false, error: 'Unsupported file type' };
  }
  const dataBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!dataBase64) return { ok: false, error: 'Empty file data' };
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes < 1 || sizeBytes > MEDIA_LIBRARY_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)`,
    };
  }

  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const filename = input.filename?.trim() || filenameForMediaType(mediaType);
    const explicitSlug = normalizeSlugField(input.slug);
    let slug: string | null;
    if (explicitSlug) {
      const existing = await dbGetMediaBySlug(explicitSlug);
      if (existing) return { ok: false, error: 'Slug already in use' };
      slug = explicitSlug;
    } else {
      const derived = slugFromFilename(filename);
      if (derived) {
        const { rows: takenRows } = await pool.query<{ slug: string }>(
          `SELECT slug FROM media_library WHERE slug = $1 OR slug LIKE $2 LIMIT 500`,
          [derived, `${derived}-%`],
        );
        const taken = new Set(takenRows.map((row) => String(row.slug || '')));
        slug = uniqueMediaSlug(derived, (candidate) => taken.has(candidate)) || null;
      } else {
        slug = null;
      }
    }
    const { rows } = await pool.query<{ id: string; created_at: string }>(
      `INSERT INTO media_library (filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        filename,
        mediaType,
        sizeBytes,
        dataBase64,
        input.altText?.trim() || null,
        input.uploadedBy?.trim() || null,
        slug,
      ],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Failed to save file' };
    return {
      ok: true,
      item: {
        id: row.id,
        filename,
        mediaType,
        sizeBytes,
        altText: input.altText?.trim() || null,
        uploadedBy: input.uploadedBy?.trim() || null,
        createdAt: row.created_at,
        slug,
        ...recordUrls(row.id, slug),
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message.includes('media_library_slug_uidx') || message.includes('duplicate key')) {
      if (!normalizeSlugField(input.slug)) {
        const filename = input.filename?.trim() || filenameForMediaType(input.mediaType);
        const fallback = uniqueMediaSlug(
          `${slugFromFilename(filename) || 'image'}-${randomUUID().slice(0, 8)}`,
          () => false,
        );
        return dbAddMedia({ ...input, slug: fallback });
      }
      return { ok: false, error: 'Slug already in use' };
    }
    console.error('[media-library] add failed', e);
    return { ok: false, error: 'Failed to save file' };
  }
}

async function dbUpdateMedia(
  id: string,
  input: {
    mediaType: string;
    dataBase64: string;
    filename?: string;
  },
): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string } | null> {
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isMediaLibraryMediaType(mediaType)) {
    return { ok: false, error: 'Unsupported file type' };
  }
  const dataBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!dataBase64) return { ok: false, error: 'Empty file data' };
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes < 1 || sizeBytes > MEDIA_LIBRARY_MAX_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${MEDIA_LIBRARY_MAX_BYTES / (1024 * 1024)} MB)`,
    };
  }

  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const filename = input.filename?.trim() || null;
    const { rows } = await pool.query<{
      id: string;
      filename: string;
      alt_text: string | null;
      uploaded_by: string | null;
      created_at: string;
      slug: string | null;
    }>(
      `UPDATE media_library
       SET media_type = $2,
           size_bytes = $3,
           data_base64 = $4,
           filename = COALESCE($5, filename)
       WHERE id = $1
       RETURNING id, filename, alt_text, uploaded_by, created_at, slug`,
      [id.trim(), mediaType, sizeBytes, dataBase64, filename],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Not found' };
    const slug = normalizeSlugField(row.slug);
    return {
      ok: true,
      item: {
        id: row.id,
        filename: row.filename,
        mediaType,
        sizeBytes,
        altText: row.alt_text,
        uploadedBy: row.uploaded_by,
        createdAt: row.created_at,
        slug,
        ...recordUrls(row.id, slug),
      },
    };
  } catch (e) {
    console.error('[media-library] update failed', e);
    return { ok: false, error: 'Failed to save file' };
  }
}

async function dbDeleteMedia(id: string): Promise<boolean | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const result = await pool.query(`DELETE FROM media_library WHERE id = $1`, [id.trim()]);
    return (result.rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[media-library] delete failed', e);
    return false;
  }
}

export async function storeListMedia(limit = 200): Promise<MediaLibrarySummary[]> {
  if (isMediaLibraryDbConfigured()) {
    const rows = await dbListMedia(limit);
    if (rows) return rows;
  }
  return fileListMedia().slice(0, limit);
}

export async function storeGetMedia(id: string): Promise<MediaLibraryRecord | null> {
  if (!id.trim()) return null;
  if (isMediaLibraryDbConfigured()) {
    const row = await dbGetMedia(id);
    if (row) return row;
  }
  return fileGetMedia(id);
}

export async function storeGetMediaBySlug(slug: string): Promise<MediaLibraryRecord | null> {
  const wanted = normalizeMediaSlug(slug);
  if (!wanted) return null;
  if (isMediaLibraryDbConfigured()) {
    const row = await dbGetMediaBySlug(wanted);
    if (row) return row;
  }
  return fileGetMediaBySlug(wanted);
}

/** Lookup by UUID or public slug. */
export async function storeGetMediaByRef(idOrSlug: string): Promise<MediaLibraryRecord | null> {
  const ref = idOrSlug.trim();
  if (!ref) return null;
  if (isMediaId(ref)) {
    const byId = await storeGetMedia(ref);
    if (byId) return byId;
  }
  return storeGetMediaBySlug(ref);
}

export async function storeAddMedia(input: {
  filename?: string;
  mediaType: string;
  dataBase64: string;
  altText?: string | null;
  uploadedBy?: string | null;
  slug?: string | null;
}): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string }> {
  if (isMediaLibraryDbConfigured()) {
    const result = await dbAddMedia(input);
    if (result) return result;
  }
  return fileAddMedia(input);
}

export async function storeUpdateMedia(
  id: string,
  input: {
    mediaType: string;
    dataBase64: string;
    filename?: string;
  },
): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string }> {
  if (!id.trim()) return { ok: false, error: 'Not found' };
  if (isMediaLibraryDbConfigured()) {
    const result = await dbUpdateMedia(id, input);
    if (result) return result;
  }
  return fileUpdateMedia(id, input);
}

export async function storeDeleteMedia(id: string): Promise<boolean> {
  if (!id.trim()) return false;
  if (isMediaLibraryDbConfigured()) {
    const result = await dbDeleteMedia(id);
    if (result !== null) return result;
  }
  return fileDeleteMedia(id);
}

export async function storeUpdateMediaMeta(
  id: string,
  input: { slug?: string | null; altText?: string | null },
): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string }> {
  const existing = await storeGetMedia(id);
  if (!existing) return { ok: false, error: 'Not found' };
  const slug =
    input.slug !== undefined ? normalizeSlugField(input.slug) : existing.slug;
  const altText =
    input.altText !== undefined ? input.altText?.trim() || null : existing.altText;

  if (isMediaLibraryDbConfigured()) {
    try {
      const pool = await ensureSchema();
      if (pool) {
        const { rows } = await pool.query<{
          id: string;
          filename: string;
          media_type: string;
          size_bytes: string;
          alt_text: string | null;
          uploaded_by: string | null;
          created_at: string;
          slug: string | null;
        }>(
          `UPDATE media_library SET slug = $2, alt_text = $3 WHERE id = $1
           RETURNING id, filename, media_type, size_bytes, alt_text, uploaded_by, created_at, slug`,
          [existing.id, slug, altText],
        );
        const row = rows[0];
        if (row) {
          const nextSlug = normalizeSlugField(row.slug);
          return {
            ok: true,
            item: {
              id: row.id,
              filename: row.filename,
              mediaType: row.media_type,
              sizeBytes: Number(row.size_bytes),
              altText: row.alt_text,
              uploadedBy: row.uploaded_by,
              createdAt: row.created_at,
              slug: nextSlug,
              ...recordUrls(row.id, nextSlug),
            },
          };
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : '';
      if (message.includes('media_library_slug_uidx') || message.includes('duplicate key')) {
        return { ok: false, error: 'Slug already in use' };
      }
      console.error('[media-library] meta update failed', e);
      return { ok: false, error: 'Failed to update file' };
    }
  }

  const record: MediaLibraryRecord = {
    ...existing,
    slug,
    altText,
    ...recordUrls(existing.id, slug),
  };
  writeFileSync(mediaRecordPath(existing.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const { dataBase64: _d, ...summary } = record;
  return { ok: true, item: summary };
}

/** Branding uploads: raster max 2 MB, SVG max 200 KB. */
export function brandingBlobFromMedia(
  record: MediaLibraryRecord,
):
  | { ok: true; kind: 'raster'; dataBase64: string; mediaType: string }
  | { ok: true; kind: 'svg'; svg: string }
  | { ok: false; error: string } {
  if (!isBrandingApplyMediaType(record.mediaType)) {
    return { ok: false, error: 'Only PNG, JPEG, WebP, or SVG images can be used for branding' };
  }
  if (isBrandSvgMediaType(record.mediaType)) {
    if (record.sizeBytes > BRAND_SVG_MAX_CHARS) {
      return { ok: false, error: 'SVG too large for branding (max 200 KB)' };
    }
    const raw = Buffer.from(record.dataBase64, 'base64').toString('utf8');
    const svg = sanitizeInlineSvg(raw.trim());
    if (!svg) {
      return { ok: false, error: 'File must contain valid <svg> markup (max 200 KB).' };
    }
    return { ok: true, kind: 'svg', svg };
  }
  if (record.sizeBytes > LOGO_UPLOAD_MAX_BYTES) {
    return { ok: false, error: 'Image too large for branding (max 2 MB)' };
  }
  return { ok: true, kind: 'raster', dataBase64: record.dataBase64, mediaType: record.mediaType };
}
