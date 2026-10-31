/**
 * GET  /api/work-day/clients — list contacts for field picker
 * POST /api/work-day/clients — create { name, phone?, email? }
 */
import type { APIRoute } from 'astro';
import { compareClientsForList, searchClientsEnhanced } from '../../../lib/clientSearch';
import {
  attachPortalLinksForList,
  contactSummary,
  createContact,
  isContactApiConfigured,
  listContacts,
} from '../../../lib/contactApi';
import { jsonResponse } from '../../../lib/apiResponse';
import { requireWorkDayApi } from '../../../lib/workDayApiGate';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const q = url.searchParams.get('q')?.trim() || '';
  const limitRaw = Number(url.searchParams.get('limit') ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;

  if (q) {
    const result = await searchClientsEnhanced(q, limit);
    if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
    const clients = result.data.contacts
      .map((c) => ({ ...contactSummary(c), matchReason: c._matchReason }))
      .sort(compareClientsForList);
    return jsonResponse({ ok: true, clients });
  }

  const result = await listContacts({ limit });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);
  const withLinks = await attachPortalLinksForList(result.data.contacts.filter((c) => !c.archived));
  const clients = withLinks.map(contactSummary).sort(compareClientsForList);
  return jsonResponse({ ok: true, clients });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireWorkDayApi(context);
  if (auth instanceof Response) return auth;

  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const name = String(body.name ?? '').trim();
  if (!name) return jsonResponse({ ok: false, error: 'name is required' }, 400);

  const result = await createContact({
    name,
    phone: body.phone != null ? String(body.phone).trim() : undefined,
    email: body.email != null ? String(body.email).trim() : undefined,
    company: body.company != null ? String(body.company).trim() : undefined,
  });
  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, result.status ?? 502);

  return jsonResponse({ ok: true, contact: contactSummary(result.data) });
};
