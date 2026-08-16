/**
 * Name.com DNS API client (v4).
 * Credentials stored per-domain in the client vault (contact Data tab).
 * Global fallback: NAMECOM_USERNAME / NAMECOM_TOKEN env vars.
 *
 * @see https://www.name.com/api-docs
 */
import { serverEnv } from './serverEnv.ts';

const NAMECOM_API = 'https://api.name.com/v4';

export type NamecomRecord = {
  id: number;
  domainName: string;
  host: string;  // '' = apex
  fqdn: string;
  type: string;
  answer: string;
  ttl: number;
  priority?: number;
};

export type NamecomResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export type NamecomCredentials = {
  username: string;
  token: string;
};

/** Resolve credentials: explicit > env fallback. */
export function resolveNamecomCredentials(
  creds?: Partial<NamecomCredentials>,
): NamecomCredentials | null {
  const username = creds?.username?.trim() || serverEnv('NAMECOM_USERNAME')?.trim();
  const token = creds?.token?.trim() || serverEnv('NAMECOM_TOKEN')?.trim();
  if (!username || !token) return null;
  return { username, token };
}

export function isNamecomConfigured(creds?: Partial<NamecomCredentials>): boolean {
  return resolveNamecomCredentials(creds) !== null;
}

function authHeader(creds: NamecomCredentials): string {
  return 'Basic ' + btoa(`${creds.username}:${creds.token}`);
}

async function namecomFetch<T>(
  path: string,
  creds: NamecomCredentials,
  init?: RequestInit,
): Promise<NamecomResult<T>> {
  const res = await fetch(`${NAMECOM_API}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(creds),
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: Record<string, unknown>;
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return { ok: false, error: 'Invalid JSON from Name.com', status: res.status };
  }

  if (!res.ok) {
    const msg =
      (body.message as string) ||
      (body.details as string) ||
      `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: body as T };
}

/** List all DNS records for a domain. */
export async function namecomListRecords(
  domain: string,
  creds: NamecomCredentials,
): Promise<NamecomResult<NamecomRecord[]>> {
  const out = await namecomFetch<{ records?: NamecomRecord[] }>(
    `/domains/${encodeURIComponent(domain)}/records`,
    creds,
  );
  if (!out.ok) return out;
  return { ok: true, data: out.data.records ?? [] };
}

/** Create a DNS record. */
export async function namecomCreateRecord(
  domain: string,
  record: { host: string; type: string; answer: string; ttl?: number; priority?: number },
  creds: NamecomCredentials,
): Promise<NamecomResult<NamecomRecord>> {
  const body: Record<string, unknown> = {
    host: record.host,
    type: record.type.toUpperCase(),
    answer: record.answer,
    ttl: record.ttl ?? 300,
  };
  if (record.priority != null) body.priority = record.priority;

  return namecomFetch<NamecomRecord>(
    `/domains/${encodeURIComponent(domain)}/records`,
    creds,
    { method: 'POST', body: JSON.stringify(body) },
  );
}

/** Delete a DNS record by id. */
export async function namecomDeleteRecord(
  domain: string,
  recordId: number,
  creds: NamecomCredentials,
): Promise<NamecomResult<Record<string, never>>> {
  return namecomFetch<Record<string, never>>(
    `/domains/${encodeURIComponent(domain)}/records/${recordId}`,
    creds,
    { method: 'DELETE' },
  );
}

/** Update a DNS record by id (full replacement). */
export async function namecomUpdateRecord(
  domain: string,
  recordId: number,
  record: { host: string; type: string; answer: string; ttl?: number; priority?: number },
  creds: NamecomCredentials,
): Promise<NamecomResult<NamecomRecord>> {
  const body: Record<string, unknown> = {
    host: record.host,
    type: record.type.toUpperCase(),
    answer: record.answer,
    ttl: record.ttl ?? 300,
  };
  if (record.priority != null) body.priority = record.priority;

  return namecomFetch<NamecomRecord>(
    `/domains/${encodeURIComponent(domain)}/records/${recordId}`,
    creds,
    { method: 'PUT', body: JSON.stringify(body) },
  );
}

export type NamecomDomain = {
  domainName: string;
  expireDate?: string;
  createDate?: string;
  locked?: boolean;
  autorenewEnabled?: boolean;
  privacyEnabled?: boolean;
  nameservers?: string[];
};

/** List domains on the account. */
export async function namecomListDomains(
  creds: NamecomCredentials,
): Promise<NamecomResult<NamecomDomain[]>> {
  const out = await namecomFetch<{
    domains?: NamecomDomain[];
  }>('/domains', creds);
  if (!out.ok) return out;
  return { ok: true, data: out.data.domains ?? [] };
}

/** Get one domain — includes nameservers (authoritative for where DNS is hosted). */
export async function namecomGetDomain(
  domain: string,
  creds: NamecomCredentials,
): Promise<NamecomResult<NamecomDomain>> {
  return namecomFetch<NamecomDomain>(`/domains/${encodeURIComponent(domain)}`, creds);
}

/** Point the domain at new nameservers (Name.com, Cloudflare, etc.). */
export async function namecomSetNameservers(
  domain: string,
  nameservers: string[],
  creds: NamecomCredentials,
): Promise<NamecomResult<NamecomDomain>> {
  const ns = nameservers.map((n) => n.trim().replace(/\.$/, '')).filter(Boolean);
  if (!ns.length) return { ok: false, error: 'nameservers is required' };
  return namecomFetch<NamecomDomain>(
    `/domains/${encodeURIComponent(domain)}:setNameservers`,
    creds,
    { method: 'POST', body: JSON.stringify({ nameservers: ns }) },
  );
}

/** True when Name.com is still hosting the zone (records API will work). */
export function isNamecomHostedDns(nameservers: string[] | undefined): boolean {
  return (nameservers ?? []).some((ns) => /\.name\.com$/i.test(ns.replace(/\.$/, '')));
}

/** Verify credentials work (ping). */
export async function namecomPing(
  creds: NamecomCredentials,
): Promise<NamecomResult<{ username: string }>> {
  return namecomFetch<{ username: string }>('/hello', creds);
}

/** Summarize a record list for display. */
export function formatNamecomRecords(records: NamecomRecord[]): string {
  if (!records.length) return 'No DNS records found.';
  return records
    .map(
      (r) =>
        `[${r.id}] ${r.type.padEnd(5)} ${(r.host || '@').padEnd(20)} → ${r.answer}${r.priority != null ? ` (priority ${r.priority})` : ''} TTL=${r.ttl}`,
    )
    .join('\n');
}
