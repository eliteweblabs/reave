/**
 * GET  /api/c/[contactUid]/work/[jobSlug]/files — list project files (portal)
 * POST /api/c/[contactUid]/work/[jobSlug]/files — client upload (multipart field: file)
 */

import type { APIRoute } from 'astro';
import { loadPortalJob } from '../../../../../../../lib/portalWorkAuth';
import {
  PROJECT_FILE_MAX_BYTES,
  PROJECT_UPLOAD_MEDIA_TYPES,
  portalProjectFileUrl,
  storeAddProjectFile,
  storeListProjectFiles,
  type ProjectFileSummary,
} from '../../../../../../../lib/projectFiles';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function toPortalFiles(contactUid: string, jobSlug: string, files: ProjectFileSummary[]) {
  return files.map((file) => ({
    id: file.id,
    filename: file.filename,
    mediaType: file.mediaType,
    sizeBytes: file.sizeBytes,
    source: file.source,
    createdAt: file.createdAt,
    url: portalProjectFileUrl(contactUid, jobSlug, file.id),
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  if (!contactUid || !jobSlug) return json({ ok: false, error: 'Not found' }, 404);

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  const files = await storeListProjectFiles(jobSlug);
  const portalFiles = toPortalFiles(contactUid, jobSlug, files);
  return json({ ok: true, files: portalFiles, count: portalFiles.length });
};

export const POST: APIRoute = async ({ params, request }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  if (!contactUid || !jobSlug) return json({ ok: false, error: 'Not found' }, 404);

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ ok: false, error: 'Expected multipart form data' }, 400);
  }

  const file = form.get('file');
  if (!(file instanceof File) || !file.size) {
    return json({ ok: false, error: 'Missing file' }, 400);
  }

  const mediaType = file.type.trim().toLowerCase();
  if (!PROJECT_UPLOAD_MEDIA_TYPES.has(mediaType)) {
    return json({ ok: false, error: 'File must be an image (JPEG, PNG, GIF, WebP) or PDF' }, 400);
  }
  if (file.size > PROJECT_FILE_MAX_BYTES) {
    return json(
      { ok: false, error: `File too large (max ${PROJECT_FILE_MAX_BYTES / (1024 * 1024)} MB)` },
      400,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await storeAddProjectFile(jobSlug, {
    filename: file.name.trim() || undefined,
    mediaType,
    dataBase64: buffer.toString('base64'),
    uploadedBy: contactUid,
    source: 'client',
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);

  const portalFile = {
    id: result.file.id,
    filename: result.file.filename,
    mediaType: result.file.mediaType,
    sizeBytes: result.file.sizeBytes,
    source: result.file.source,
    createdAt: result.file.createdAt,
    url: portalProjectFileUrl(contactUid, jobSlug, result.file.id),
  };
  return json({ ok: true, file: portalFile });
};
