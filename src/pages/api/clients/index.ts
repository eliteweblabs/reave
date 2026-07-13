/**
 * GET  /api/clients — list contacts from contact-api (summaries only)
 * POST /api/clients — create { name, email?, phone?, company?, notes? }
 */

import type { APIContext } from 'astro';
import { searchClientsEnhanced } from '../../../lib/clientSearch';
import {
  contactSummary,
  createContact,
  isContactApiConfigured,
  listContacts,
} from '../../../lib/contactApi';

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
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim() || undefined;
  const limitRaw = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  if (!q) {
    const result = await listContacts({ limit });
    if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
    return json({
      ok: true,
      total: result.data.total,
      clients: result.data.contacts.filter((c) => !c.archived).map(contactSummary),
    });
  }

  const result = await searchClientsEnhanced(q, limit);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const clients = result.data.contacts
    .filter((c) => !c.archived)
    .map((c) => ({
      ...contactSummary(c),
      matchReason: c._matchReason,
    }));

  return json({
    ok: true,
    total: clients.length,
    clients,
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

  const name = String(body.name ?? '').trim();
  if (!name) return json({ ok: false, error: 'name is required' }, 400);

  const result = await createContact({
    name,
    email: String(body.email ?? '').trim() || undefined,
    phone: String(body.phone ?? '').trim() || undefined,
    company: String(body.company ?? '').trim() || undefined,
    notes: String(body.notes ?? '').trim() || undefined,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
  return json({ ok: true, ...contactSummary(result.data), notes: result.data.notes ?? '' }, 201);
}
