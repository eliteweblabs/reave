/**
 * GET /api/c/[contactUid]/work/[jobSlug]/files/[id]
 * Serve a project file to the client portal (contact link is the access token).
 */

import type { APIRoute } from 'astro';
import { getContact, extractPortal, contactStringField } from '../../../../../../../lib/contactApi';
import { storeGetProjectFile } from '../../../../../../../lib/projectFiles';
import { isSafeWorkSlug, storeReadWork } from '../../../../../../../lib/workStore';

export const prerender = false;

async function loadPortalJob(contactUid: string, jobSlug: string) {
  const contactRes = await getContact(contactUid);
  if (!contactRes.ok || contactRes.data.archived) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  const portal = extractPortal(contactRes.data);
  if (portal?.enabled === false) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  if (!isSafeWorkSlug(jobSlug)) {
    return { ok: false as const, status: 400, error: 'Invalid job' };
  }

  const job = await storeReadWork(jobSlug);
  if (!job || job.status === 'archived' || job.contact_uid !== contactUid) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }

  return {
    ok: true as const,
    contactName: contactStringField(contactRes.data.name) || 'Client',
    job,
  };
}

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
};
