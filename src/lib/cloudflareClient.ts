/**
 * Cloudflare DNS API client (zone DNS edit token).
 * @see https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/
 */
import { serverEnv } from './serverEnv.ts';

const CF_API = 'https://api.cloudflare.com/client/v4';

export type CfDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  ttl: number;
  proxied?: boolean;
};

export type CfResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function token(): string | undefined {
  return serverEnv('CLOUDFLARE_API_TOKEN')?.trim();
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfResult<T>> {
  const apiToken = token();
  if (!apiToken) {
    return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };
  }

  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: { success?: boolean; errors?: { message: string }[]; result?: T; result_info?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: 'Invalid JSON from Cloudflare', status: res.status };
  }

  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: body.result as T };
}

export function isCloudflareConfigured(): boolean {
  return Boolean(token());
}

/** Apex or subdomain → zone apex (reave.app). */
export function cloudflareZoneName(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

/** Resend record name → FQDN within zone. */
export function fqdnRecordName(zone: string, recordName: string): string {
  const base = zone.toLowerCase().replace(/\.$/, '');
  const rel = recordName.trim().toLowerCase().replace(/\.$/, '');
  if (!rel || rel === base) return base;
  if (rel.endsWith(`.${base}`)) return rel;
  return `${rel}.${base}`;
}

function normalizeDnsContent(type: string, content: string): string {
  const t = type.toUpperCase();
  let c = content.trim();
  if (t === 'TXT' && c.startsWith('"') && c.endsWith('"')) {
    c = c.slice(1, -1);
  }
  if (t === 'MX' || t === 'CNAME') {
    c = c.replace(/\.$/, '').toLowerCase();
  }
  return c;
}

export function dnsRecordsMatch(
  existing: Pick<CfDnsRecord, 'type' | 'content' | 'priority'>,
  expected: { type: string; content: string; priority?: number },
): boolean {
  const type = expected.type.toUpperCase();
  if (existing.type.toUpperCase() !== type) return false;
  if (normalizeDnsContent(type, existing.content) !== normalizeDnsContent(type, expected.content)) {
    return false;
  }
  if (type === 'MX') {
    return (existing.priority ?? 0) === (expected.priority ?? 0);
  }
  return true;
}

/** Recognized TXT semantics for disambiguating multiple records at the same name. */
export type TxtRecordKind = 'spf' | 'dmarc' | 'unknown';

export function txtRecordKind(content: string): TxtRecordKind {
  const c = normalizeDnsContent('TXT', content).toLowerCase();
  if (c.startsWith('v=spf1')) return 'spf';
  if (c.startsWith('v=dmarc1')) return 'dmarc';
  return 'unknown';
}

type TxtUpsertPick =
  | { action: 'update'; record: CfDnsRecord }
  | { action: 'create' }
  | { action: 'error'; error: string };

/** When several TXT records share a name, pick the one to replace (or create a new one). */
export function pickTxtRecordForUpsert(
  existing: CfDnsRecord[],
  expectedContent: string,
): TxtUpsertPick {
  const host = existing[0]?.name ?? 'host';
  const kind = txtRecordKind(expectedContent);
  if (kind === 'unknown') {
    return {
      action: 'error',
      error: `Multiple TXT records for ${host}; cannot pick which to update — use v=spf1 (SPF) or v=DMARC1 (DMARC), or resolve manually in Cloudflare`,
    };
  }

  const prefix = kind === 'spf' ? 'v=spf1' : 'v=dmarc1';
  const label = kind === 'spf' ? 'SPF' : 'DMARC';
  const matches = existing.filter((r) =>
    normalizeDnsContent('TXT', r.content).toLowerCase().startsWith(prefix),
  );

  if (matches.length === 1) return { action: 'update', record: matches[0] };
  if (matches.length === 0) return { action: 'create' };
  return {
    action: 'error',
    error: `Multiple ${label} TXT records at ${host}; remove duplicates in Cloudflare first`,
  };
}

async function patchDnsRecord(
  zoneId: string,
  recordId: string,
  body: Record<string, unknown>,
): Promise<CfResult<{ action: 'updated'; record: CfDnsRecord }>> {
  const out = await cfFetch<CfDnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!out.ok) return out;
  return { ok: true, data: { action: 'updated', record: out.data } };
}

export async function cloudflareFindZone(zoneName: string): Promise<CfResult<{ id: string; name: string }>> {
  const verify = await cloudflareVerifyToken();
  if (!verify.ok) {
    return {
      ok: false,
      error: `Cloudflare token invalid — regenerate in Cloudflare dashboard and update CLOUDFLARE_API_TOKEN on Railway (${verify.error})`,
    };
  }

  const explicit = serverEnv('CLOUDFLARE_ZONE_ID')?.trim();
  if (explicit) {
    const out = await cfFetch<{ id: string; name: string }>(`/zones/${explicit}`);
    if (!out.ok) return out;
    return { ok: true, data: out.data };
  }

  const out = await cfFetch<{ id: string; name: string }[]>(
    `/zones?name=${encodeURIComponent(zoneName)}&status=active&per_page=5`,
  );
  if (!out.ok) return out;
  const zone = out.data.find((z) => z.name.toLowerCase() === zoneName.toLowerCase());
  if (!zone) {
    return {
      ok: false,
      error: `Cloudflare zone not found for ${zoneName}. Token may lack Zone → DNS → Read/Edit on that zone — update CLOUDFLARE_API_TOKEN permissions in Cloudflare.`,
    };
  }
  return { ok: true, data: zone };
}

export async function cloudflareListDnsRecords(
  zoneId: string,
  opts?: { type?: string; name?: string },
): Promise<CfResult<CfDnsRecord[]>> {
  const params = new URLSearchParams({ per_page: '100' });
  if (opts?.type) params.set('type', opts.type);
  if (opts?.name) params.set('name', opts.name);

  const records: CfDnsRecord[] = [];
  let page = 1;

  while (true) {
    params.set('page', String(page));
    const out = await cfFetch<CfDnsRecord[]>(`/zones/${zoneId}/dns_records?${params}`);
    if (!out.ok) return out;
    records.push(...out.data);
    if (out.data.length < 100) break;
    page += 1;
    if (page > 20) break;
  }

  return { ok: true, data: records };
}

export async function cloudflareUpsertDnsRecord(
  zoneId: string,
  expected: { type: string; name: string; content: string; priority?: number; ttl?: number },
  existing: CfDnsRecord[],
): Promise<CfResult<{ action: 'unchanged' | 'created' | 'updated'; record: CfDnsRecord }>> {
  const type = expected.type.toUpperCase();
  const match = existing.find(
    (r) =>
      r.type.toUpperCase() === type &&
      r.name.toLowerCase() === expected.name.toLowerCase() &&
      dnsRecordsMatch(r, expected),
  );
  if (match) {
    return { ok: true, data: { action: 'unchanged', record: match } };
  }

  const sameNameType = existing.filter(
    (r) => r.type.toUpperCase() === type && r.name.toLowerCase() === expected.name.toLowerCase(),
  );

  const body: Record<string, unknown> = {
    type,
    name: expected.name,
    content: expected.content,
    ttl: expected.ttl ?? 1,
    proxied: false,
  };
  if (type === 'MX' && expected.priority != null) {
    body.priority = expected.priority;
  }

  if (sameNameType.length === 1) {
    const out = await patchDnsRecord(zoneId, sameNameType[0].id, body);
    if (!out.ok) return out;
    return { ok: true, data: out.data };
  }

  if (sameNameType.length > 1) {
    if (type === 'TXT') {
      const pick = pickTxtRecordForUpsert(sameNameType, expected.content);
      if (pick.action === 'error') return { ok: false, error: pick.error };
      if (pick.action === 'update') {
        const out = await patchDnsRecord(zoneId, pick.record.id, body);
        if (!out.ok) return out;
        return { ok: true, data: out.data };
      }
      // No matching SPF/DMARC TXT yet — add another TXT record at this name (valid in DNS).
    } else {
      return {
        ok: false,
        error: `Multiple ${type} records for ${expected.name}; resolve manually in Cloudflare`,
      };
    }
  }

  const out = await cfFetch<CfDnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!out.ok) return out;
  return { ok: true, data: { action: 'created', record: out.data } };
}

export async function cloudflareVerifyToken(): Promise<CfResult<{ id: string; status: string }>> {
  const userVerify = await cfFetch<{ id: string; status: string }>('/user/tokens/verify');
  if (userVerify.ok) return userVerify;

  // Account-scoped tokens (cfat_*) fail /user/tokens/verify — probe /accounts instead.
  const accounts = await cfFetch<{ id: string; name: string }[]>('/accounts?per_page=1');
  if (accounts.ok && accounts.data.length > 0) {
    return { ok: true, data: { id: accounts.data[0].id, status: 'active (account token)' } };
  }

  return {
    ok: false,
    error:
      userVerify.error ||
      (accounts.ok ? 'Cloudflare token could not be verified' : accounts.error),
  };
}
