/**
 * Per-project file repository — media and attachments tied to work/jobs.
 * Postgres when DATABASE_URL is set; otherwise JSON + base64 under WORK_DIR/.files/.
 */

import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';
import type { ChatImageAttachment } from './chatTypes';
import { isSafeWorkSlug, workDir } from './workStore';
import { serverEnv } from './serverEnv';

export type ProjectFileSource = 'chat' | 'admin' | 'agent' | 'email' | 'client';

export interface ProjectFileSummary {
  id: string;
  jobSlug: string;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  source: ProjectFileSource;
  sourceRef: string | null;
  uploadedBy: string | null;
  createdAt: string;
  url: string;
}

export interface ProjectFileRecord extends ProjectFileSummary {
  dataBase64: string;
}

export const PROJECT_FILE_MAX_BYTES = 10 * 1024 * 1024;

const IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

export const PROJECT_UPLOAD_MEDIA_TYPES = new Set([
  ...IMAGE_MEDIA_TYPES,
  'application/pdf',
]);

/** Additional types allowed when importing from inbound email attachments. */
export const EMAIL_ATTACHMENT_MEDIA_TYPES = new Set([
  ...PROJECT_UPLOAD_MEDIA_TYPES,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

export function isAllowedProjectFileMediaType(
  mediaType: string,
  source?: ProjectFileSource,
): boolean {
  const normalized = mediaType.trim().toLowerCase();
  if (PROJECT_UPLOAD_MEDIA_TYPES.has(normalized)) return true;
  if (source === 'email' && EMAIL_ATTACHMENT_MEDIA_TYPES.has(normalized)) return true;
  return false;
}

const FILENAME_MEDIA_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

export function normalizeEmailAttachmentMediaType(
  contentType: string,
  filename: string,
): string {
  const fromHeader = contentType.trim().toLowerCase().split(';')[0]?.trim() ?? '';
  if (fromHeader && fromHeader !== 'application/octet-stream') return fromHeader;

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return FILENAME_MEDIA_TYPE[ext] ?? fromHeader ?? 'application/octet-stream';
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS project_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_slug      TEXT NOT NULL,
  filename      TEXT NOT NULL,
  media_type    TEXT NOT NULL,
  size_bytes    BIGINT NOT NULL,
  data_base64   TEXT NOT NULL,
  uploaded_by   TEXT,
  source        TEXT NOT NULL DEFAULT 'admin' CHECK (source IN ('chat', 'admin', 'agent', 'email', 'client')),
  source_ref    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_files_job_idx ON project_files (job_slug, created_at DESC);
ALTER TABLE project_files DROP CONSTRAINT IF EXISTS project_files_source_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_source_check
  CHECK (source IN ('chat', 'admin', 'agent', 'email', 'client'));
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
  _pool = new pg.Pool({ connectionString: url, ssl: poolSsl(url), max: 5 });
  return _pool;
}

async function ensureSchema(): Promise<pg.Pool | null> {
  const pool = getPool();
  if (!pool) return null;
  if (!_schemaReady) {
    _schemaReady = pool.query(SCHEMA_SQL).then(() => undefined).catch((e) => {
      _schemaReady = null;
      throw e;
    });
  }
  await _schemaReady;
  return pool;
}

export function isProjectFilesDbConfigured(): boolean {
  return !!databaseUrl();
}

export function projectFileUrl(jobSlug: string, fileId: string): string {
  return `/api/work/${encodeURIComponent(jobSlug)}/files/${encodeURIComponent(fileId)}`;
}

export function portalProjectFileUrl(contactUid: string, jobSlug: string, fileId: string): string {
  return `/api/c/${encodeURIComponent(contactUid)}/work/${encodeURIComponent(jobSlug)}/files/${encodeURIComponent(fileId)}`;
}

function extensionForMediaType(mediaType: string): string {
  switch (mediaType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

export function filenameForMediaType(mediaType: string, index = 0): string {
  const ext = extensionForMediaType(mediaType);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const suffix = index > 0 ? `-${index + 1}` : '';
  return `${stamp}${suffix}.${ext}`;
}

function filesDir(): string {
  const dir = join(workDir(), '.files');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function jobFilesDir(slug: string): string {
  const dir = join(filesDir(), slug);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function fileRecordPath(slug: string, id: string): string {
  return join(jobFilesDir(slug), `${id}.json`);
}

function normalizeSummary(
  raw: Record<string, unknown>,
  jobSlug: string,
): ProjectFileSummary | null {
  const id = String(raw.id ?? '').trim();
  const filename = String(raw.filename ?? '').trim();
  const mediaType = String(raw.mediaType ?? raw.media_type ?? '').trim().toLowerCase();
  if (!id || !filename || !mediaType) return null;
  const sizeBytes = Number(raw.sizeBytes ?? raw.size_bytes ?? 0);
  const source = String(raw.source ?? 'admin').trim() as ProjectFileSource;
  return {
    id,
    jobSlug,
    filename,
    mediaType,
    sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : 0,
    source: ['chat', 'admin', 'agent', 'email', 'client'].includes(source) ? source : 'admin',
    sourceRef:
      raw.sourceRef != null
        ? String(raw.sourceRef)
        : raw.source_ref != null
          ? String(raw.source_ref)
          : null,
    uploadedBy:
      raw.uploadedBy != null
        ? String(raw.uploadedBy)
        : raw.uploaded_by != null
          ? String(raw.uploaded_by)
          : null,
    createdAt:
      String(raw.createdAt ?? raw.created_at ?? '').trim() || new Date().toISOString(),
    url: projectFileUrl(jobSlug, id),
  };
}

function fileListProjectFiles(slug: string): ProjectFileSummary[] {
  if (!isSafeWorkSlug(slug)) return [];
  const dir = jobFilesDir(slug);
  const out: ProjectFileSummary[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, name), 'utf8')) as Record<string, unknown>;
      const summary = normalizeSummary(parsed, slug);
      if (summary) out.push(summary);
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function fileGetProjectFile(slug: string, id: string): ProjectFileRecord | null {
  if (!isSafeWorkSlug(slug) || !id.trim()) return null;
  const path = fileRecordPath(slug, id.trim());
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    const summary = normalizeSummary(parsed, slug);
    const dataBase64 = String(parsed.dataBase64 ?? parsed.data_base64 ?? '').trim();
    if (!summary || !dataBase64) return null;
    return { ...summary, dataBase64 };
  } catch {
    return null;
  }
}

function fileAddProjectFile(
  slug: string,
  input: {
    filename?: string;
    mediaType: string;
    dataBase64: string;
    uploadedBy?: string | null;
    source?: ProjectFileSource;
    sourceRef?: string | null;
  },
): { ok: true; file: ProjectFileSummary } | { ok: false; error: string } {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isAllowedProjectFileMediaType(mediaType, input.source)) {
    return { ok: false, error: 'Unsupported file type' };
  }
  const dataBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!dataBase64) return { ok: false, error: 'Empty file data' };
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes < 1 || sizeBytes > PROJECT_FILE_MAX_BYTES) {
    return { ok: false, error: `File too large (max ${PROJECT_FILE_MAX_BYTES / (1024 * 1024)} MB)` };
  }

  const id = randomUUID();
  const filename = input.filename?.trim() || filenameForMediaType(mediaType);
  const record: ProjectFileRecord = {
    id,
    jobSlug: slug,
    filename,
    mediaType,
    sizeBytes,
    source: input.source ?? 'admin',
    sourceRef: input.sourceRef?.trim() || null,
    uploadedBy: input.uploadedBy?.trim() || null,
    createdAt: new Date().toISOString(),
    url: projectFileUrl(slug, id),
    dataBase64,
  };
  writeFileSync(fileRecordPath(slug, id), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const { dataBase64: _d, ...summary } = record;
  return { ok: true, file: summary };
}

function fileDeleteProjectFile(slug: string, id: string): boolean {
  if (!isSafeWorkSlug(slug) || !id.trim()) return false;
  const path = fileRecordPath(slug, id.trim());
  if (!existsSync(path)) return false;
  try {
    unlinkSync(path);
    return true;
  } catch {
    return false;
  }
}

async function dbListProjectFiles(slug: string): Promise<ProjectFileSummary[] | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{
      id: string;
      job_slug: string;
      filename: string;
      media_type: string;
      size_bytes: string;
      uploaded_by: string | null;
      source: string;
      source_ref: string | null;
      created_at: string;
    }>(
      `SELECT id, job_slug, filename, media_type, size_bytes, uploaded_by, source, source_ref, created_at
       FROM project_files WHERE job_slug = $1 ORDER BY created_at DESC`,
      [slug],
    );
    return rows.map((row) => ({
      id: row.id,
      jobSlug: row.job_slug,
      filename: row.filename,
      mediaType: row.media_type,
      sizeBytes: Number(row.size_bytes),
      uploadedBy: row.uploaded_by,
      source: row.source as ProjectFileSource,
      sourceRef: row.source_ref,
      createdAt: row.created_at,
      url: projectFileUrl(slug, row.id),
    }));
  } catch (e) {
    console.error('[project-files] list failed', e);
    return null;
  }
}

async function dbGetProjectFile(slug: string, id: string): Promise<ProjectFileRecord | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const { rows } = await pool.query<{
      id: string;
      job_slug: string;
      filename: string;
      media_type: string;
      size_bytes: string;
      data_base64: string;
      uploaded_by: string | null;
      source: string;
      source_ref: string | null;
      created_at: string;
    }>(
      `SELECT id, job_slug, filename, media_type, size_bytes, data_base64, uploaded_by, source, source_ref, created_at
       FROM project_files WHERE job_slug = $1 AND id = $2`,
      [slug, id],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      jobSlug: row.job_slug,
      filename: row.filename,
      mediaType: row.media_type,
      sizeBytes: Number(row.size_bytes),
      dataBase64: row.data_base64,
      uploadedBy: row.uploaded_by,
      source: row.source as ProjectFileSource,
      sourceRef: row.source_ref,
      createdAt: row.created_at,
      url: projectFileUrl(slug, row.id),
    };
  } catch (e) {
    console.error('[project-files] get failed', e);
    return null;
  }
}

async function dbAddProjectFile(
  slug: string,
  input: {
    filename?: string;
    mediaType: string;
    dataBase64: string;
    uploadedBy?: string | null;
    source?: ProjectFileSource;
    sourceRef?: string | null;
  },
): Promise<{ ok: true; file: ProjectFileSummary } | { ok: false; error: string } | null> {
  const mediaType = input.mediaType.trim().toLowerCase();
  if (!isAllowedProjectFileMediaType(mediaType, input.source)) {
    return { ok: false, error: 'Unsupported file type' };
  }
  const dataBase64 = input.dataBase64.replace(/^data:[^;]+;base64,/, '').trim();
  if (!dataBase64) return { ok: false, error: 'Empty file data' };
  const sizeBytes = Math.floor((dataBase64.length * 3) / 4);
  if (sizeBytes < 1 || sizeBytes > PROJECT_FILE_MAX_BYTES) {
    return { ok: false, error: `File too large (max ${PROJECT_FILE_MAX_BYTES / (1024 * 1024)} MB)` };
  }

  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const filename = input.filename?.trim() || filenameForMediaType(mediaType);
    const { rows } = await pool.query<{
      id: string;
      created_at: string;
    }>(
      `INSERT INTO project_files (job_slug, filename, media_type, size_bytes, data_base64, uploaded_by, source, source_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        slug,
        filename,
        mediaType,
        sizeBytes,
        dataBase64,
        input.uploadedBy?.trim() || null,
        input.source ?? 'admin',
        input.sourceRef?.trim() || null,
      ],
    );
    const row = rows[0];
    if (!row) return { ok: false, error: 'Failed to save file' };
    return {
      ok: true,
      file: {
        id: row.id,
        jobSlug: slug,
        filename,
        mediaType,
        sizeBytes,
        uploadedBy: input.uploadedBy?.trim() || null,
        source: input.source ?? 'admin',
        sourceRef: input.sourceRef?.trim() || null,
        createdAt: row.created_at,
        url: projectFileUrl(slug, row.id),
      },
    };
  } catch (e) {
    console.error('[project-files] add failed', e);
    return { ok: false, error: 'Failed to save file' };
  }
}

async function dbDeleteProjectFile(slug: string, id: string): Promise<boolean | null> {
  try {
    const pool = await ensureSchema();
    if (!pool) return null;
    const result = await pool.query(
      `DELETE FROM project_files WHERE job_slug = $1 AND id = $2`,
      [slug, id],
    );
    return (result.rowCount ?? 0) > 0;
  } catch (e) {
    console.error('[project-files] delete failed', e);
    return false;
  }
}

export async function storeListProjectFiles(slug: string): Promise<ProjectFileSummary[]> {
  if (!isSafeWorkSlug(slug)) return [];
  if (isProjectFilesDbConfigured()) {
    const rows = await dbListProjectFiles(slug);
    if (rows) return rows;
  }
  return fileListProjectFiles(slug);
}

export async function storeGetProjectFile(
  slug: string,
  id: string,
): Promise<ProjectFileRecord | null> {
  if (!isSafeWorkSlug(slug) || !id.trim()) return null;
  if (isProjectFilesDbConfigured()) {
    const row = await dbGetProjectFile(slug, id);
    if (row) return row;
  }
  return fileGetProjectFile(slug, id);
}

export async function storeAddProjectFile(
  slug: string,
  input: {
    filename?: string;
    mediaType: string;
    dataBase64: string;
    uploadedBy?: string | null;
    source?: ProjectFileSource;
    sourceRef?: string | null;
  },
): Promise<{ ok: true; file: ProjectFileSummary } | { ok: false; error: string }> {
  if (!isSafeWorkSlug(slug)) return { ok: false, error: 'Invalid slug' };

  if (isProjectFilesDbConfigured()) {
    const result = await dbAddProjectFile(slug, input);
    if (result) return result;
  }
  return fileAddProjectFile(slug, input);
}

export async function storeDeleteProjectFile(slug: string, id: string): Promise<boolean> {
  if (!isSafeWorkSlug(slug) || !id.trim()) return false;
  if (isProjectFilesDbConfigured()) {
    const result = await dbDeleteProjectFile(slug, id);
    if (result != null) return result;
  }
  return fileDeleteProjectFile(slug, id);
}

export async function storeAddChatImagesToProject(
  slug: string,
  images: ChatImageAttachment[],
  opts: {
    uploadedBy?: string | null;
    sourceRef?: string | null;
    source?: ProjectFileSource;
  } = {},
): Promise<ProjectFileSummary[]> {
  const saved: ProjectFileSummary[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const result = await storeAddProjectFile(slug, {
      filename: filenameForMediaType(img.mediaType, i),
      mediaType: img.mediaType,
      dataBase64: img.data,
      uploadedBy: opts.uploadedBy,
      source: opts.source ?? 'chat',
      sourceRef: opts.sourceRef,
    });
    if (result.ok) saved.push(result.file);
  }
  return saved;
}

export async function promoteChatImagesToLinkedProjects(
  threadId: string,
  images: ChatImageAttachment[],
  jobSlugs: string[],
  uploadedBy?: string | null,
): Promise<Record<string, ProjectFileSummary[]>> {
  const out: Record<string, ProjectFileSummary[]> = {};
  if (!images.length || !jobSlugs.length) return out;
  const uniqueSlugs = [...new Set(jobSlugs.map((s) => s.trim()).filter(isSafeWorkSlug))];
  for (const slug of uniqueSlugs) {
    const files = await storeAddChatImagesToProject(slug, images, {
      uploadedBy,
      sourceRef: threadId,
      source: 'chat',
    });
    if (files.length) out[slug] = files;
  }
  return out;
}
