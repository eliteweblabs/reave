/**
 * GET  /api/clients — list contacts from contact-api (summaries only)
 * POST /api/clients — create { name, email?, phone?, company?, notes? }
 */

import type { APIContext } from 'astro';
import {
  compareClientsForList,
  filterClientsByKind,
  parseClientKindFilter,
  searchClientsEnhanced,
} from '../../../lib/clientSearch';
import { resolveClientLogoUrl } from '../../../lib/clientBranding';
import {
  contactSummary,
  createContact,
  extractPortal,
  isContactApiConfigured,
  listContacts,
  setContactPersonal,
  type ContactRecord,
} from '../../../lib/contactApi';

function clientListEntry(c: ContactRecord) {
  return {
    ...contactSummary(c),
    logoUrl: resolveClientLogoUrl(extractPortal(c), c.uid),
  };
}
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
  const kind = parseClientKindFilter(url.searchParams.get('kind'));
  const limitRaw = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  if (!q) {
    const result = await listContacts({ limit });
    if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);
    const clients = filterClientsByKind(
      result.data.contacts.filter((c) => !c.archived).map(clientListEntry),
      kind,
    ).sort(compareClientsForList);
    return json({
      ok: true,
      total: clients.length,
      clients,
    });
  }

  const result = await searchClientsEnhanced(q, limit, { kind });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const clients = result.data.contacts
    .filter((c) => !c.archived)
    .map((c) => ({
      ...clientListEntry(c),
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

  if (body.personal === true) {
    const flagged = await setContactPersonal(result.data.uid, true);
    if (!flagged.ok) return json({ ok: false, error: flagged.error }, 502);
  }

  // Fire the welcome/follow-up automations (non-blocking; skip personal contacts).
  if (body.personal !== true) {
    void import('../../../lib/newsletterEngine')
      .then((m) => m.onContactCreated(result.data))
      .catch((e) => console.warn('[newsletter] onContactCreated failed', e));
  }

  return json(
    {
      ok: true,
      ...contactSummary(result.data),
      personal: body.personal === true,
      notes: result.data.notes ?? '',
    },
    201,
  );
}
