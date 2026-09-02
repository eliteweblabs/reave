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

/** Website-scraped contact logos/icons — kept out of the main library grid. */
export const MEDIA_LIBRARY_CATEGORY_BRAND_ICON = 'brand-icon';

export type MediaLibraryCategory = typeof MEDIA_LIBRARY_CATEGORY_BRAND_ICON | null;

export interface MediaLibrarySummary {
  id: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  altText: string | null;
  uploadedBy: string | null;
  createdAt: string;
  slug: string | null;
  category: MediaLibraryCategory;
  url: string;
  thumbnailUrl: string;
  publicUrl: string;
}

export type MediaLibraryListOpts = {
  limit?: number;
  category?: string | null;
  excludeCategory?: string | null;
};

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
ALTER TABLE media_library ADD COLUMN IF NOT EXISTS category TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS media_library_slug_uidx
  ON media_library (slug) WHERE slug IS NOT NULL AND btrim(slug) <> '';
CREATE INDEX IF NOT EXISTS media_library_category_idx
  ON media_library (category, created_at DESC);
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

function normalizeCategoryField(raw: unknown): MediaLibraryCategory {
  const value = String(raw ?? '').trim();
  return value === MEDIA_LIBRARY_CATEGORY_BRAND_ICON ? MEDIA_LIBRARY_CATEGORY_BRAND_ICON : null;
}

export function isBrandIconMediaCategory(category: string | null | undefined): boolean {
  return normalizeCategoryField(category) === MEDIA_LIBRARY_CATEGORY_BRAND_ICON;
}

export function domainFromWebsiteUrl(website: string): string {
  try {
    const host = new URL(website.trim()).hostname.replace(/^www\./i, '');
    return host || website.trim();
  } catch {
    return website.trim();
  }
}

export function brandIconMediaSlug(domain: string, asset: 'logo' | 'icon'): string {
  const base = normalizeMediaSlug(domain) || 'site';
  return `brand-${base}-${asset}`.slice(0, SLUG_MAX);
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
    category: normalizeCategoryField(raw.category),
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
  category?: MediaLibraryCategory;
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
    category: normalizeCategoryField(input.category),
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

async function dbListMedia(opts: MediaLibraryListOpts = {}): Promise<MediaLibrarySummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const capped = Math.min(Math.max(1, opts.limit ?? 200), 500);
    const params: unknown[] = [capped];
    let where = '';
    if (opts.category) {
      params.push(opts.category);
      where = ` WHERE category = $${params.length}`;
    } else if (opts.excludeCategory) {
      params.push(opts.excludeCategory);
      where = ` WHERE category IS DISTINCT FROM $${params.length}`;
    }
    const { rows } = await pool.query<{
      id: string;
      filename: string;
      media_type: string;
      size_bytes: string;
      alt_text: string | null;
      uploaded_by: string | null;
      created_at: string;
      slug: string | null;
      category: string | null;
    }>(
      `SELECT id, filename, media_type, size_bytes, alt_text, uploaded_by, created_at, slug, category
       FROM media_library${where} ORDER BY created_at DESC LIMIT $1`,
      params,
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
        category: normalizeCategoryField(row.category),
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
      category: string | null;
    }>(
      `SELECT id, filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, created_at, slug, category
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
      category: normalizeCategoryField(row.category),
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
      category: string | null;
    }>(
      `SELECT id, filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, created_at, slug, category
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
      category: normalizeCategoryField(row.category),
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
  category?: MediaLibraryCategory;
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
      `INSERT INTO media_library (filename, media_type, size_bytes, data_base64, alt_text, uploaded_by, slug, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        filename,
        mediaType,
        sizeBytes,
        dataBase64,
        input.altText?.trim() || null,
        input.uploadedBy?.trim() || null,
        slug,
        normalizeCategoryField(input.category),
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
        category: normalizeCategoryField(input.category),
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
      category: string | null;
    }>(
      `UPDATE media_library
       SET media_type = $2,
           size_bytes = $3,
           data_base64 = $4,
           filename = COALESCE($5, filename)
       WHERE id = $1
       RETURNING id, filename, alt_text, uploaded_by, created_at, slug, category`,
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
        category: normalizeCategoryField(row.category),
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

export async function storeListMedia(
  opts: number | MediaLibraryListOpts = 200,
): Promise<MediaLibrarySummary[]> {
  const listOpts: MediaLibraryListOpts =
    typeof opts === 'number' ? { limit: opts } : { ...opts };
  const limit = listOpts.limit ?? 200;
  if (isMediaLibraryDbConfigured()) {
    const rows = await dbListMedia({ ...listOpts, limit });
    if (rows) return rows;
  }
  let items = fileListMedia();
  if (listOpts.category) {
    items = items.filter((item) => item.category === listOpts.category);
  } else if (listOpts.excludeCategory) {
    items = items.filter((item) => item.category !== listOpts.excludeCategory);
  }
  return items.slice(0, limit);
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
  category?: MediaLibraryCategory;
}): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string }> {
  if (isMediaLibraryDbConfigured()) {
    const result = await dbAddMedia(input);
    if (result) return result;
  }
  return fileAddMedia(input);
}

/** Copy an upload into the media library. Branding slots keep their own bytes; library rows survive slot clears. */
export async function archiveUploadToMediaLibrary(input: {
  filename?: string;
  mediaType: string;
  dataBase64: string;
  altText?: string | null;
  uploadedBy?: string | null;
}): Promise<void> {
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isMediaLibraryMediaType(mediaType)) return;
  const result = await storeAddMedia({
    filename: input.filename,
    mediaType,
    dataBase64: input.dataBase64,
    altText: input.altText ?? null,
    uploadedBy: input.uploadedBy ?? null,
  });
  if (!result.ok) {
    console.error('[media-library] archive upload failed', result.error);
  }
}

/** Archive SVG markup (logo/icon uploads) as image/svg+xml in the media library. */
export async function archiveSvgUploadToMediaLibrary(input: {
  filename?: string;
  svg: string;
  uploadedBy?: string | null;
}): Promise<void> {
  const name = input.filename?.trim();
  const filename =
    name && name.toLowerCase().endsWith('.svg') ? name : name ? `${name}.svg` : 'upload.svg';
  await archiveUploadToMediaLibrary({
    filename,
    mediaType: 'image/svg+xml',
    dataBase64: Buffer.from(input.svg, 'utf8').toString('base64'),
    uploadedBy: input.uploadedBy,
  });
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
          category: string | null;
        }>(
          `UPDATE media_library SET slug = $2, alt_text = $3 WHERE id = $1
           RETURNING id, filename, media_type, size_bytes, alt_text, uploaded_by, created_at, slug, category`,
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
              category: normalizeCategoryField(row.category),
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
    category: existing.category,
    ...recordUrls(existing.id, slug),
  };
  writeFileSync(mediaRecordPath(existing.id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const { dataBase64: _d, ...summary } = record;
  return { ok: true, item: summary };
}

const REMOTE_MEDIA_FETCH_TIMEOUT_MS = 8_000;

function guessRemoteImageMediaType(buf: Buffer, fallback = 'image/png'): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return fallback;
}

function extensionForMediaType(mediaType: string): string {
  switch (mediaType.trim().toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    default:
      return 'png';
  }
}

async function fetchRemoteMediaBytes(url: string): Promise<{ buffer: Buffer; mediaType: string } | null> {
  const remote = url.trim();
  if (!remote) return null;
  try {
    const parsed = new URL(remote);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_MEDIA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(remote, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/*,*/*;q=0.8' },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MEDIA_LIBRARY_MAX_BYTES) return null;
    const headerType = res.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
    const mediaType =
      headerType && isLogoUploadMediaType(headerType)
        ? headerType
        : guessRemoteImageMediaType(buf);
    if (!isLogoUploadMediaType(mediaType)) return null;
    return { buffer: buf, mediaType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Upsert a website-scraped logo/icon into the Brand Icons collection. */
export async function storeUpsertBrandIconMedia(input: {
  website: string;
  asset: 'logo' | 'icon';
  remoteUrl: string;
  altText?: string | null;
  uploadedBy?: string | null;
}): Promise<{ ok: true; item: MediaLibrarySummary } | { ok: false; error: string }> {
  const fetched = await fetchRemoteMediaBytes(input.remoteUrl);
  if (!fetched) return { ok: false, error: 'Could not download image from website.' };

  const domain = domainFromWebsiteUrl(input.website);
  const slug = brandIconMediaSlug(domain, input.asset);
  const ext = extensionForMediaType(fetched.mediaType);
  const filename = `${normalizeMediaSlug(domain) || 'site'}-${input.asset}.${ext}`;
  const altText =
    input.altText?.trim() ||
    `${domain} — ${input.asset === 'logo' ? 'logo' : 'icon'} (${input.website.replace(/^https?:\/\//i, '')})`;

  const existing = await storeGetMediaBySlug(slug);
  if (existing) {
    const updated = await storeUpdateMedia(existing.id, {
      mediaType: fetched.mediaType,
      dataBase64: fetched.buffer.toString('base64'),
      filename,
    });
    if (!updated.ok) return updated;
    if (updated.item.category !== MEDIA_LIBRARY_CATEGORY_BRAND_ICON && isMediaLibraryDbConfigured()) {
      try {
        const pool = await ensureSchema();
        await pool?.query(`UPDATE media_library SET category = $2, alt_text = $3 WHERE id = $1`, [
          existing.id,
          MEDIA_LIBRARY_CATEGORY_BRAND_ICON,
          altText,
        ]);
      } catch {
        /* best-effort */
      }
    }
    return {
      ok: true,
      item: {
        ...updated.item,
        category: MEDIA_LIBRARY_CATEGORY_BRAND_ICON,
        altText,
      },
    };
  }

  return storeAddMedia({
    filename,
    mediaType: fetched.mediaType,
    dataBase64: fetched.buffer.toString('base64'),
    altText,
    uploadedBy: input.uploadedBy ?? null,
    slug,
    category: MEDIA_LIBRARY_CATEGORY_BRAND_ICON,
  });
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
