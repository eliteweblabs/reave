/**
 * GET /api/work/[slug]/files/download-all — ZIP of all project repository files
 */

import type { APIContext } from 'astro';
import { buildStoreZip } from '../../../../../lib/projectFilesZip';
import { storeGetProjectFile, storeListProjectFiles } from '../../../../../lib/projectFiles';
import { isSafeWorkSlug, storeReadWork } from '../../../../../lib/workStore';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const slug = context.params.slug?.trim() ?? '';
  if (!slug || !isSafeWorkSlug(slug)) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid slug' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!(await storeReadWork(slug))) {
    return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const summaries = await storeListProjectFiles(slug);
  if (!summaries.length) {
    return new Response(JSON.stringify({ ok: false, error: 'No files to download' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const entries: { name: string; data: Buffer }[] = [];
  for (const summary of summaries) {
    const file = await storeGetProjectFile(slug, summary.id);
    if (!file?.dataBase64) continue;
    entries.push({
      name: file.filename || `file-${file.id}`,
      data: Buffer.from(file.dataBase64, 'base64'),
    });
  }

  if (!entries.length) {
    return new Response(JSON.stringify({ ok: false, error: 'No files to download' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const zip = buildStoreZip(entries);
  const filename = `${slug}-files.zip`;

  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(zip.length),
    },
  });
}
