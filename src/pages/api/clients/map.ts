/**
 * GET /api/clients/map — owner-only contact list with address/geo/icon for the map.
 */

import type { APIContext } from 'astro';
import { compareClientsForList } from '../../../lib/clientSearch';
import { resolveClientIconUrl, resolveClientLogoUrl } from '../../../lib/clientBranding';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  attachPortalLinksForList,
  CLIENT_KINDS,
  contactStringField,
  contactSummary,
  extractPortal,
  isContactApiConfigured,
  listContacts,
  type ContactRecord,
} from '../../../lib/contactApi';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
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
    // Light pin faces — keep original ink (no dark-bg flip).
    iconUrl: resolveClientIconUrl(portal, c.uid, { bg: 'light' }),
    logoUrl: resolveClientLogoUrl(portal, c.uid, { bg: 'light' }),
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  const result = await listContacts({ limit });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  const withLinks = await attachPortalLinksForList(
    result.data.contacts.filter((c) => !c.archived),
    { forMap: true },
  );

  const clients = withLinks.map(mapClientEntry).sort(compareClientsForList);
  const counts = {
    all: clients.length,
    professional: 0,
    service: 0,
    proposed: 0,
    personal: 0,
    located: 0,
  };
  for (const c of clients) {
    if (CLIENT_KINDS.includes(c.kind)) counts[c.kind] += 1;
    if (c.located) counts.located += 1;
  }

  return json({
    ok: true,
    total: clients.length,
    located: counts.located,
    counts,
    clients,
  });
}
