/**
 * GET /api/clients/map — owner-only client list with address/geo for the map.
 */

import type { APIContext } from 'astro';
import { compareClientsForList } from '../../../lib/clientSearch';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  attachPortalLinksForList,
  CLIENT_KINDS,
  contactStringField,
  contactSummary,
  extractPortal,
  isContactApiConfigured,
  listContacts,
  normalizeClientKind,
  type ClientKind,
  type ContactRecord,
} from '../../../lib/contactApi';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function parseKindParam(raw: string | null): ClientKind | 'all' {
  const v = (raw ?? '').trim().toLowerCase();
  if (v === 'all' || !v) return 'all';
  return normalizeClientKind(v) ?? 'all';
}

function mapClientEntry(c: ContactRecord) {
  const portal = extractPortal(c);
  const address = contactStringField(portal?.address);
  const geo =
    portal?.geo &&
    Number.isFinite(portal.geo.lat) &&
    Number.isFinite(portal.geo.lng)
      ? { lat: portal.geo.lat, lng: portal.geo.lng }
      : null;
  return {
    ...contactSummary(c),
    address,
    geo,
    located: Boolean(geo),
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const kind = parseKindParam(url.searchParams.get('kind'));
  const limitRaw = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  const result = await listContacts({ limit });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const withLinks = await attachPortalLinksForList(
    result.data.contacts.filter((c) => !c.archived),
    { forMap: true },
  );

  const allClients = withLinks.map(mapClientEntry).sort(compareClientsForList);
  const counts = {
    all: allClients.length,
    professional: 0,
    service: 0,
    proposed: 0,
    personal: 0,
    located: 0,
  };
  for (const c of allClients) {
    if (CLIENT_KINDS.includes(c.kind)) counts[c.kind] += 1;
    if (c.located) counts.located += 1;
  }

  const clients = kind === 'all' ? allClients : allClients.filter((c) => c.kind === kind);

  return json({
    ok: true,
    total: clients.length,
    located: clients.filter((c) => c.located).length,
    counts,
    clients,
  });
}
