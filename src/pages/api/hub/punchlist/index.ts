/**
 * GET  /api/hub/punchlist — list this install's punch-list items (official hub)
 * POST /api/hub/punchlist — install owner adds a feature request
 */

import type { APIRoute } from 'astro';
import { clientIp } from '../../../../lib/clientIp';
import { checkInMemoryRateLimit } from '../../../../lib/inMemoryRateLimit';
import {
  createHubPunchlistItem,
  isPunchlistHubHost,
  listHubPunchlistForSlug,
  verifyPunchlistHubAuth,
} from '../../../../lib/punchlistHub';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  if (!isPunchlistHubHost()) return json({ ok: false, error: 'Not found' }, 404);
  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);
  const items = await listHubPunchlistForSlug(auth.slug);
  return json({ ok: true, items, company: auth.company, slug: auth.slug });
};

export const POST: APIRoute = async ({ request }) => {
  if (!isPunchlistHubHost()) return json({ ok: false, error: 'Not found' }, 404);
  const auth = verifyPunchlistHubAuth(request);
  if (!auth.ok) return json({ ok: false, error: auth.error }, auth.status);

  const rate = checkInMemoryRateLimit(`hub-punchlist:${auth.slug}:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 40,
  });
  if (!rate.ok) return json({ ok: false, error: 'Too many items. Please try again later.' }, 429);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const company =
    String(body.company ?? body.company_name ?? '').trim() || auth.company;
  const result = await createHubPunchlistItem({
    slug: auth.slug,
    company,
    title: body.title,
  });
  if (!result.ok) return json({ ok: false, error: result.error }, 400);
  return json({ ok: true, item: result.item }, 201);
};
