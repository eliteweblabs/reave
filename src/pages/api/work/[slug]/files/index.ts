/**
 * GET  /api/work/[slug]/files — list files in the project repository
 * POST /api/work/[slug]/files — upload a file (multipart form field: file)
 */

import type { APIContext } from 'astro';
import {
  storeAddProjectFile,
  storeListProjectFiles,
} from '../../../../../lib/projectFiles';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';
import { parseProjectFileUpload } from '../../../../../lib/parseProjectFileUpload';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const files = await storeListProjectFiles(slug);
  return jsonResponse({ ok: true, files, count: files.length });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const parsed = await parseProjectFileUpload(context.request);
  if (!parsed.ok) return parsed.response;

  const result = await storeAddProjectFile(slug, {
    filename: parsed.filename,
    mediaType: parsed.mediaType,
    dataBase64: parsed.buffer.toString('base64'),
    uploadedBy: userId,
    source: 'admin',
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 400);
  return jsonResponse({ ok: true, file: result.file });
}
