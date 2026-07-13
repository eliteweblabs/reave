/**
 * GET    /api/work/[slug]/files/[id] — serve file content
 * DELETE /api/work/[slug]/files/[id] — remove file from repository
 */

import type { APIContext } from 'astro';
import { storeDeleteProjectFile, storeGetProjectFile } from '../../../../../lib/projectFiles';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  const id = context.params.id?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!id) return json({ ok: false, error: 'Missing file id' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const file = await storeGetProjectFile(slug, id);
  if (!file) return json({ ok: false, error: 'File not found' }, 404);

  const buffer = Buffer.from(file.dataBase64, 'base64');
  const disposition = file.mediaType.startsWith('image/')
    ? 'inline'
    : `inline; filename="${file.filename.replace(/"/g, '')}"`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': file.mediaType,
      'Content-Disposition': disposition,
      'Cache-Control': 'private, max-age=3600',
      'Content-Length': String(buffer.length),
    },
  });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  const id = context.params.id?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!id) return json({ ok: false, error: 'Missing file id' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const deleted = await storeDeleteProjectFile(slug, id);
  if (!deleted) return json({ ok: false, error: 'File not found' }, 404);
  return json({ ok: true, id, deleted: true });
}
