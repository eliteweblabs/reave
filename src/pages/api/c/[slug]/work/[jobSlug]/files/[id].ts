/**
 * GET /api/c/[contactUid]/work/[jobSlug]/files/[id]
 * Serve a project file to the client portal (contact link is the access token).
 */

import type { APIRoute } from 'astro';
import { loadPortalJob } from '../../../../../../../lib/portalWorkAuth';
import { storeGetProjectFile, projectFileResponseHeaders } from '../../../../../../../lib/projectFiles';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  const id = (params.id ?? '').trim();
  if (!contactUid || !jobSlug || !id) {
    return new Response('Not found', { status: 404 });
  }

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return new Response('Not found', { status: ctx.status });

  const file = await storeGetProjectFile(jobSlug, id);
  if (!file) return new Response('Not found', { status: 404 });

  const buffer = Buffer.from(file.dataBase64, 'base64');

  return new Response(buffer, {
    status: 200,
    headers: projectFileResponseHeaders(file.mediaType, file.filename, buffer.length),
  });
};
