/**
 * GET /api/clients/map — public contact list for /admin/client-map.
 * Rate-limited; omits email/phone/portal (map only needs name, geo, kind, icons).
 */

import type { APIContext } from 'astro';
import { compareClientsForList } from '../../../lib/clientSearch';
import { resolveClientIconUrl, resolveClientLogoUrl } from '../../../lib/clientBranding';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import {
  attachPortalLinksForList,
  CLIENT_KINDS,
  contactStringField,
  extractPortal,
  getClientKind,
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

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
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
    uid: c.uid,
    name: c.name,
    company: contactStringField(c.company),
    kind: getClientKind(c),
    address,
    geo,
    located: Boolean(geo),
    // Light pin faces — keep original ink (no dark-bg flip).
    iconUrl: resolveClientIconUrl(portal, c.uid, { bg: 'light' }),
    logoUrl: resolveClientLogoUrl(portal, c.uid, { bg: 'light' }),
  };
}

export async function GET(context: APIContext): Promise<Response> {
  const ip = clientIp(context.request);
  const limitHit = checkInMemoryRateLimit(`clients-map:${ip}`, {
    windowMs: 60_000,
    maxPerWindow: 30,
  });
  if (!limitHit.ok) {
    return json(
      { ok: false, error: 'Too many requests — wait a moment and try again.' },
      429,
    );
  }

  if (!isContactApiConfigured()) {
    return json({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }

  const url = new URL(context.request.url);
  const limitRaw = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 200;

  const result = await listContacts({ limit });
  if (!result.ok) return json({ ok: false, error: result.error }, result.status ?? 502);

  // Higher concurrency — map needs portal geo for every contact; default 12
  // feels hung when the book is large.
  const withLinks = await attachPortalLinksForList(
    result.data.contacts.filter((c) => !c.archived),
    { forMap: true, concurrency: 32 },
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
