/**
 * GET    /api/work/[slug]/files/[id] — serve file content
 * DELETE /api/work/[slug]/files/[id] — remove file from repository
 */

import type { APIContext } from 'astro';
import { storeDeleteProjectFile, storeGetProjectFile, projectFileResponseHeaders, isSafeProjectFileId } from '../../../../../lib/projectFiles';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../../lib/apiResponse';

export const prerender = false;


export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  const id = context.params.id?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!id || !isSafeProjectFileId(id)) return jsonResponse({ ok: false, error: 'Invalid file id' }, 400);
  if (!(await storeReadWork(slug))) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const file = await storeGetProjectFile(slug, id);
  if (!file) return jsonResponse({ ok: false, error: 'File not found' }, 404);

  const buffer = Buffer.from(file.dataBase64, 'base64');

  return new Response(buffer, {
    status: 200,
    headers: projectFileResponseHeaders(file.mediaType, file.filename, buffer.length),
  });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  const id = context.params.id?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return jsonResponse({ ok: false, error: 'Invalid slug' }, 400);
  if (!id || !isSafeProjectFileId(id)) return jsonResponse({ ok: false, error: 'Invalid file id' }, 400);
  if (!(await storeReadWork(slug))) return jsonResponse({ ok: false, error: 'Not found' }, 404);

  const deleted = await storeDeleteProjectFile(slug, id);
  if (!deleted) return jsonResponse({ ok: false, error: 'File not found' }, 404);
  return jsonResponse({ ok: true, id, deleted: true });
}
