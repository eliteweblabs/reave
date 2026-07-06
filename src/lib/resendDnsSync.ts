/**
 * Ensure Resend domain DNS records exist in Cloudflare (check + create/update).
 */
import {
  cloudflareFindZone,
  cloudflareListDnsRecords,
  cloudflareUpsertDnsRecord,
  cloudflareZoneName,
  fqdnRecordName,
  isCloudflareConfigured,
} from './cloudflareClient.ts';
import { serverEnv } from './serverEnv.ts';

export type ResendDnsRecord = {
  record: string;
  name: string;
  type: string;
  value: string;
  priority?: number;
  status?: string;
  ttl?: string;
};

export type ResendDomainDetail = {
  id: string;
  name: string;
  status: string;
  capabilities: { sending: string; receiving: string };
  records: ResendDnsRecord[];
};

export type DnsSyncRow = {
  domain: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  resend_status?: string;
  action: 'unchanged' | 'created' | 'updated' | 'skipped' | 'error';
  detail?: string;
};

export type ResendDnsSyncResult =
  | {
      ok: true;
      domain: string;
      zone: string;
      resend_status: string;
      rows: DnsSyncRow[];
      summary: string;
    }
  | { ok: false; error: string };

function resendApiKey(): string | undefined {
  return serverEnv('RESEND_API_KEY')?.trim();
}

export function isResendDnsSyncConfigured(): boolean {
  return isCloudflareConfigured() && Boolean(resendApiKey());
}

async function resendFetch<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const key = resendApiKey();
  if (!key) return { ok: false, error: 'RESEND_API_KEY is not set' };

  const res = await fetch(`https://api.resend.com${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const raw = await res.text();
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, error: `Invalid JSON from Resend (${res.status})` };
  }

  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'message' in body
        ? String((body as { message: unknown }).message)
        : `HTTP ${res.status}`;
    return { ok: false, error: msg };
  }

  return { ok: true, data: body as T };
}

export async function resendGetDomainByName(domain: string): Promise<
  | { ok: true; detail: ResendDomainDetail }
  | { ok: false; error: string }
> {
  const list = await resendFetch<{ data: { id: string; name: string }[] }>('/domains');
  if (!list.ok) return list;

  const match = list.data.data.find((d) => d.name.toLowerCase() === domain.toLowerCase());
  if (!match) return { ok: false, error: `Resend domain not found: ${domain}` };

  const detail = await resendFetch<ResendDomainDetail>(`/domains/${match.id}`);
  if (!detail.ok) return detail;
  return { ok: true, detail: detail.data };
}

function expectedFromResend(domain: string, row: ResendDnsRecord): {
  fqdn: string;
  type: string;
  content: string;
  priority?: number;
} {
  const zone = cloudflareZoneName(domain);
  const fqdn = fqdnRecordName(zone, row.name);
  const type = row.type.toUpperCase();
  return {
    fqdn,
    type,
    content: row.value.trim(),
    priority: type === 'MX' ? row.priority : undefined,
  };
}

export async function syncResendDnsToCloudflare(domainInput: string): Promise<ResendDnsSyncResult> {
  const domain = domainInput.trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return { ok: false, error: 'domain is required' };

  if (!isCloudflareConfigured()) {
    return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };
  }

  const resend = await resendGetDomainByName(domain);
  if (!resend.ok) return { ok: false, error: resend.error };

  const zoneName = cloudflareZoneName(domain);
  const zone = await cloudflareFindZone(zoneName);
  if (!zone.ok) return { ok: false, error: zone.error };

  const existingAll = await cloudflareListDnsRecords(zone.data.id);
  if (!existingAll.ok) return { ok: false, error: existingAll.error };

  const rows: DnsSyncRow[] = [];

  for (const rec of resend.detail.records) {
    const expected = expectedFromResend(domain, rec);
    const sameHost = existingAll.data.filter(
      (r) => r.name.toLowerCase() === expected.fqdn.toLowerCase(),
    );

    const upsert = await cloudflareUpsertDnsRecord(
      zone.data.id,
      {
        type: expected.type,
        name: expected.fqdn,
        content: expected.content,
        priority: expected.priority,
        ttl: 1,
      },
      sameHost,
    );

    if (!upsert.ok) {
      rows.push({
        domain,
        type: expected.type,
        name: expected.fqdn,
        content: expected.content,
        priority: expected.priority,
        resend_status: rec.status,
        action: 'error',
        detail: upsert.error,
      });
      continue;
    }

    rows.push({
      domain,
      type: expected.type,
      name: expected.fqdn,
      content: expected.content,
      priority: expected.priority,
      resend_status: rec.status,
      action: upsert.data.action,
    });
  }

  const summary = formatResendDnsSyncSummary(domain, zoneName, resend.detail, rows);
  return {
    ok: true,
    domain,
    zone: zoneName,
    resend_status: resend.detail.status,
    rows,
    summary,
  };
}

export async function syncAllResendDnsToCloudflare(): Promise<
  | { ok: true; domains: ResendDnsSyncResult[]; summary: string }
  | { ok: false; error: string }
> {
  const list = await resendFetch<{ data: { name: string }[] }>('/domains');
  if (!list.ok) return { ok: false, error: list.error };

  const results: ResendDnsSyncResult[] = [];
  for (const d of list.data.data) {
    results.push(await syncResendDnsToCloudflare(d.name));
  }

  const okCount = results.filter((r) => r.ok).length;
  const changed = results.flatMap((r) => (r.ok ? r.rows.filter((row) => row.action !== 'unchanged') : []));
  const errors = results.filter((r) => !r.ok);

  const lines = [
    `Resend → Cloudflare DNS sync (${results.length} domains)`,
    `OK: ${okCount}/${results.length}`,
  ];
  if (changed.length) {
    lines.push(`Changed: ${changed.map((c) => `${c.name} ${c.type} (${c.action})`).join('; ')}`);
  } else {
    lines.push('All records already match Cloudflare.');
  }
  if (errors.length) {
    lines.push(`Errors: ${errors.map((e) => ('error' in e ? e.error : '')).join('; ')}`);
  }

  return { ok: true, domains: results, summary: lines.join('\n') };
}

export function formatResendDnsSyncSummary(
  domain: string,
  zone: string,
  resendDetail: ResendDomainDetail,
  rows: DnsSyncRow[],
): string {
  const lines = [
    `Resend DNS sync — ${domain} (zone ${zone})`,
    `Resend status: ${resendDetail.status} | send=${resendDetail.capabilities.sending} recv=${resendDetail.capabilities.receiving}`,
    '',
  ];

  for (const row of rows) {
    const pri = row.priority != null ? ` pri ${row.priority}` : '';
    lines.push(
      `${row.action.toUpperCase().padEnd(9)} ${row.type} ${row.name}${pri}`,
      `          ${row.content.slice(0, 120)}${row.content.length > 120 ? '…' : ''}`,
    );
    if (row.detail) lines.push(`          ! ${row.detail}`);
  }

  const errors = rows.filter((r) => r.action === 'error');
  const changed = rows.filter((r) => r.action === 'created' || r.action === 'updated');
  lines.push('');
  if (errors.length) {
    lines.push(`${errors.length} error(s) — fix in Cloudflare dashboard or check token permissions.`);
  } else if (changed.length) {
    lines.push(`${changed.length} record(s) updated in Cloudflare. Allow a few minutes for Resend to re-verify.`);
  } else {
    lines.push('All Resend records already present in Cloudflare — nothing to change.');
  }

  return lines.join('\n');
}
