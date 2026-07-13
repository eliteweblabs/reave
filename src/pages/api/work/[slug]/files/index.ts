/**
 * GET  /api/work/[slug]/files — list files in the project repository
 * POST /api/work/[slug]/files — upload a file (multipart form field: file)
 */

import type { APIContext } from 'astro';
import {
  PROJECT_FILE_MAX_BYTES,
  PROJECT_UPLOAD_MEDIA_TYPES,
  storeAddProjectFile,
  storeListProjectFiles,
} from '../../../../../lib/projectFiles';
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
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  const files = await storeListProjectFiles(slug);
  return json({ ok: true, files, count: files.length });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) return json({ ok: false, error: 'Invalid slug' }, 400);
  if (!(await storeReadWork(slug))) return json({ ok: false, error: 'Not found' }, 404);

  let form: FormData;
  try {
    form = await context.request.formData();
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
    return json({ ok: false, error: `File too large (max ${PROJECT_FILE_MAX_BYTES / (1024 * 1024)} MB)` }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await storeAddProjectFile(slug, {
    filename: file.name.trim() || undefined,
    mediaType,
    dataBase64: buffer.toString('base64'),
    uploadedBy: userId,
    source: 'admin',
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, file: result.file });
}
