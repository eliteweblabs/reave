/**
 * GET    /api/work/[slug]/files/[id] — serve file content
 * DELETE /api/work/[slug]/files/[id] — remove file from repository
 */

import type { APIContext } from 'astro';
import { storeDeleteProjectFile, storeGetProjectFile, projectFileResponseHeaders } from '../../../../../lib/projectFiles';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';
import { requireDashboardUser } from '../../../../../lib/dashboardAuth';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const slug = context.params.slug?.trim() ?? '';
  const id = context.params.id?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!id) return json({ ok: false, error: 'Missing file id' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const file = await storeGetProjectFile(slug, id);
  if (!file) return json({ ok: false, error: 'File not found' }, 404);

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
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!id) return json({ ok: false, error: 'Missing file id' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const deleted = await storeDeleteProjectFile(slug, id);
  if (!deleted) return json({ ok: false, error: 'File not found' }, 404);
  return json({ ok: true, id, deleted: true });
}
