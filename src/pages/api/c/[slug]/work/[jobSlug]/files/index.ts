/**
 * GET  /api/c/[contactUid]/work/[jobSlug]/files — list project files (portal)
 * POST /api/c/[contactUid]/work/[jobSlug]/files — client upload (multipart field: file)
 */

import type { APIRoute } from 'astro';
import { loadPortalJob } from '../../../../../../../lib/portalWorkAuth';
import {
  portalProjectFileUrl,
  storeAddProjectFile,
  storeListProjectFiles,
  type ProjectFileSummary,
} from '../../../../../../../lib/projectFiles';
import { checkInMemoryRateLimit } from '../../../../../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../../../../../lib/clientIp';
import { jsonResponse } from '../../../../../../../lib/apiResponse';
import { parseProjectFileUpload } from '../../../../../../../lib/parseProjectFileUpload';

export const prerender = false;

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
  if (!contactUid || !jobSlug) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return jsonResponse({ ok: false, error: ctx.error }, ctx.status);

  const files = await storeListProjectFiles(jobSlug);
  const portalFiles = toPortalFiles(contactUid, jobSlug, files);
  return jsonResponse({ ok: true, files: portalFiles, count: portalFiles.length });
};

export const POST: APIRoute = async ({ params, request }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  if (!contactUid || !jobSlug) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const rate = checkInMemoryRateLimit(`portal-file:${contactUid}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 20,
  });
  if (!rate.ok) {
    return jsonResponse(
      { ok: false, error: 'Too many uploads. Please try again later.' },
      429,
      { headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
    );
  }

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return jsonResponse({ ok: false, error: ctx.error }, ctx.status);

  const parsed = await parseProjectFileUpload(request);
  if (!parsed.ok) return parsed.response;

  const result = await storeAddProjectFile(jobSlug, {
    filename: parsed.filename,
    mediaType: parsed.mediaType,
    dataBase64: parsed.buffer.toString('base64'),
    uploadedBy: contactUid,
    source: 'client',
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);

  const portalFile = {
    id: result.file.id,
    filename: result.file.filename,
    mediaType: result.file.mediaType,
    sizeBytes: result.file.sizeBytes,
    source: result.file.source,
    createdAt: result.file.createdAt,
    url: portalProjectFileUrl(contactUid, jobSlug, result.file.id),
  };
  return jsonResponse({ ok: true, file: portalFile });
};
