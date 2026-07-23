import type { APIRoute } from 'astro';
import { loadPortalJob } from '../../../../../../lib/portalWorkAuth';
import { storeAddWorkComment, storeListWorkComments } from '../../../../../../lib/workComments';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ params }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  if (!contactUid || !jobSlug) return json({ ok: false, error: 'Not found' }, 404);

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  const comments = await storeListWorkComments(jobSlug);
  return json({ ok: true, comments });
};

export const POST: APIRoute = async ({ params, request }) => {
  const contactUid = (params.slug ?? '').trim();
  const jobSlug = (params.jobSlug ?? '').trim();
  if (!contactUid || !jobSlug) return json({ ok: false, error: 'Not found' }, 404);

  const ctx = await loadPortalJob(contactUid, jobSlug);
  if (!ctx.ok) return json({ ok: false, error: ctx.error }, ctx.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const text = typeof (body as Record<string, unknown>)?.text === 'string'
    ? String((body as Record<string, unknown>).text)
    : '';
  const result = await storeAddWorkComment(jobSlug, {
    author: 'client',
    authorName: ctx.contactName,
    text,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, comment: result.comment });
};
