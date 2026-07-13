/**
 * POST /api/clients/resolve — fuzzy match { name?, email?, phone? }
 * Supplements contact-api resolve with company-field matching.
 */

import type { APIContext } from 'astro';
import { contactSummary, isContactApiConfigured } from '../../../lib/contactApi';
import { resolveContactEnhanced } from '../../../lib/clientSearch';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return json({ ok: false, error: 'Unauthorized' }, 401);
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const name = String(body.name ?? '').trim() || undefined;
  const email = String(body.email ?? '').trim() || undefined;
  const phone = String(body.phone ?? '').trim() || undefined;

  const result = await resolveContactEnhanced({ name, email, phone });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  return json({
    ok: true,
    match: result.match,
    score: result.score,
    contact: result.contact ? contactSummary(result.contact) : undefined,
    candidates: (result.candidates ?? []).map((c) => ({
      ...contactSummary(c),
      score: c.score ?? (c as { _score?: number })._score,
      matchReason: (c as { _matchReason?: string })._matchReason,
    })),
  });
}
