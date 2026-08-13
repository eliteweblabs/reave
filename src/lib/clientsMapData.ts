import { compareClientsForList } from './clientSearch';
import { resolveClientIconUrl, resolveClientLogoUrl } from './clientBranding';
import {
  attachPortalLinksForList,
  CLIENT_KINDS,
  contactStringField,
  extractPortal,
  getClientKind,
  isContactApiConfigured,
  listContacts,
  type ContactRecord,
} from './contactApi';

export type ClientMapEntry = {
  uid: string;
  name: string;
  company: string;
  kind: string;
  address: string;
  geo: { lat: number; lng: number } | null;
  located: boolean;
  iconUrl: string | null;
  logoUrl: string | null;
};

export type ClientsMapPayload = {
  ok: true;
  total: number;
  located: number;
  counts: Record<string, number>;
  clients: ClientMapEntry[];
};

function mapClientEntry(c: ContactRecord): ClientMapEntry {
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
    iconUrl: resolveClientIconUrl(portal, c.uid, { bg: 'light' }),
    logoUrl: resolveClientLogoUrl(portal, c.uid, { bg: 'light' }),
  };
}

export async function loadClientsMapData(
  limit = 200,
): Promise<{ ok: true; data: ClientsMapPayload } | { ok: false; error: string; status?: number }> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'CONTACT_API_BASE_URL is not configured', status: 503 };
  }

  const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 200;
  const result = await listContacts({ limit: safeLimit });
  if (!result.ok) return { ok: false, error: result.error, status: result.status ?? 502 };

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
    if ((CLIENT_KINDS as readonly string[]).includes(c.kind)) {
      counts[c.kind as keyof Omit<typeof counts, 'all' | 'located'>] += 1;
    }
    if (c.located) counts.located += 1;
  }

  return {
    ok: true,
    data: {
      ok: true,
      total: clients.length,
      located: counts.located,
      counts,
      clients,
    },
  };
}
