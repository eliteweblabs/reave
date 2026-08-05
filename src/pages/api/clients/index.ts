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
import { resolveClientIconUrl, resolveClientLogoUrl } from '../../../lib/clientBranding';
import { enrichContactAddressFromPlaces } from '../../../lib/contactAddressFromPlaces';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  attachPortalLinksForList,
  contactSummary,
  createContact,
  extractPortal,
  isContactApiConfigured,
  listContacts,
  parseClientKindInput,
  setContactKind,
  type ContactRecord,
} from '../../../lib/contactApi';

function clientListEntry(c: ContactRecord) {
  const portal = extractPortal(c);
  return {
    ...contactSummary(c),
    logoUrl: resolveClientLogoUrl(portal, c.uid),
    iconUrl: resolveClientIconUrl(portal, c.uid),
  };
}

/** contact-api list omits links; attach slim portal metadata before branding/personal. */
async function clientsWithPortalLinks(contacts: ContactRecord[]): Promise<ContactRecord[]> {
  return attachPortalLinksForList(contacts.filter((c) => !c.archived));
}
export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
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
    const withLinks = await clientsWithPortalLinks(result.data.contacts);
    const clients = filterClientsByKind(withLinks.map(clientListEntry), kind).sort(
      compareClientsForList,
    );
    return json({
      ok: true,
      total: clients.length,
      clients,
    });
  }

  const result = await searchClientsEnhanced(q, limit, { kind });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  // searchClientsEnhanced already attaches slim portal links for branding/personal.
  const clients = result.data.contacts.map((c) => ({
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
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  const { userId } = auth;
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

  const kind = parseClientKindInput(body.kind, body.personal === true ? true : undefined);
  if (kind !== 'professional') {
    const flagged = await setContactKind(result.data.uid, kind);
    if (!flagged.ok) return json({ ok: false, error: flagged.error }, 502);
  }

  // Best-effort address from Google Places (company or contact name).
  if (kind !== 'personal') {
    await enrichContactAddressFromPlaces(result.data.uid);
  }

  // Fire the welcome/follow-up automations (non-blocking; skip personal/proposed contacts).
  if (kind === 'professional') {
    void import('../../../lib/newsletterEngine')
      .then((m) => m.onContactCreated(result.data))
      .catch((e) => console.warn('[newsletter] onContactCreated failed', e));
    void import('../../../lib/contactPortalEnrich')
      .then((m) => m.triggerContactPortalEnrich(result.data.uid))
      .catch((e) => console.warn('[contactPortalEnrich] trigger failed', e));
  }

  return json(
    {
      ok: true,
      ...contactSummary(result.data),
      kind,
      personal: kind === 'personal',
      notes: result.data.notes ?? '',
    },
    201,
  );
}
