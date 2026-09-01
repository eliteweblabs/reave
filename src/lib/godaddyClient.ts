/**
 * GoDaddy Domains API client.
 * Nameserver updates use v3 (PAT + domains.nameserver:update).
 * @see https://developer.godaddy.com/doc/endpoint/domains
 */
import { serverEnv } from './serverEnv.ts';

const GODADDY_API_PROD = 'https://api.godaddy.com';
const GODADDY_API_OTE = 'https://api.ote-godaddy.com';

export type GoDaddyCredentials = {
  token: string;
  /** Use GoDaddy OTE (sandbox) when true. */
  ote?: boolean;
};

export type GoDaddyResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function resolveGoDaddyCredentials(
  creds?: Partial<GoDaddyCredentials>,
): GoDaddyCredentials | null {
  const token = creds?.token?.trim() || serverEnv('GODADDY_API_TOKEN')?.trim();
  if (!token) return null;
  const ote =
    creds?.ote === true ||
    serverEnv('GODADDY_API_OTE') === '1' ||
    serverEnv('GODADDY_API_OTE')?.toLowerCase() === 'true';
  return { token, ote };
}

export function isGoDaddyConfigured(creds?: Partial<GoDaddyCredentials>): boolean {
  return resolveGoDaddyCredentials(creds) !== null;
}

function apiBase(creds: GoDaddyCredentials): string {
  return creds.ote ? GODADDY_API_OTE : GODADDY_API_PROD;
}

async function godaddyFetch<T>(
  path: string,
  creds: GoDaddyCredentials,
  init?: RequestInit,
): Promise<GoDaddyResult<T>> {
  const res = await fetch(`${apiBase(creds)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${creds.token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: Record<string, unknown> = {};
  if (raw) {
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      if (!res.ok) return { ok: false, error: raw.slice(0, 240) || `HTTP ${res.status}`, status: res.status };
    }
  }

  if (!res.ok) {
    const msg =
      (body.message as string) ||
      (body.code as string) ||
      (Array.isArray(body.errors) ? (body.errors as string[]).join('; ') : '') ||
      raw.slice(0, 240) ||
      `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  if (!raw) return { ok: true, data: {} as T };
  try {
    return { ok: true, data: JSON.parse(raw) as T };
  } catch {
    return { ok: true, data: {} as T };
  }
}

/** Verify PAT works (list domains — needs domains.domain:read). */
export async function godaddyPing(
  creds: GoDaddyCredentials,
): Promise<GoDaddyResult<{ count: number }>> {
  const out = await godaddyFetch<Array<{ domain: string }>>('/v1/domains?limit=1', creds);
  if (!out.ok) return out;
  return { ok: true, data: { count: out.data.length } };
}

export type GoDaddyDomain = {
  domain: string;
  status?: string;
  nameServers?: string[];
};

/** Read domain details including current nameservers (v1). */
export async function godaddyGetDomain(
  domain: string,
  creds: GoDaddyCredentials,
): Promise<GoDaddyResult<GoDaddyDomain>> {
  return godaddyFetch<GoDaddyDomain>(`/v1/domains/${encodeURIComponent(domain)}`, creds);
}

type GoDaddyOperation = {
  operationId?: string;
  status?: string;
  type?: string;
};

async function pollGoDaddyOperation(
  operationUrl: string,
  creds: GoDaddyCredentials,
  maxAttempts = 12,
): Promise<GoDaddyResult<GoDaddyOperation>> {
  const path = operationUrl.startsWith('http')
    ? operationUrl.replace(apiBase(creds), '')
    : operationUrl;
  for (let i = 0; i < maxAttempts; i++) {
    const out = await godaddyFetch<GoDaddyOperation>(path, creds);
    if (!out.ok) return out;
    const status = (out.data.status ?? '').toUpperCase();
    if (status === 'COMPLETED' || status === 'SUCCESS') return out;
    if (status === 'FAILED' || status === 'ERROR') {
      return { ok: false, error: `GoDaddy operation ${status.toLowerCase()}` };
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { ok: true, data: { status: 'PENDING' } };
}

/**
 * Point the domain at Cloudflare (or any) nameservers.
 * Requires PAT scope domains.nameserver:update.
 */
export async function godaddySetNameservers(
  domain: string,
  nameservers: string[],
  creds: GoDaddyCredentials,
): Promise<GoDaddyResult<{ async: boolean; status?: string }>> {
  const apex = domain.trim().toLowerCase().replace(/\.$/, '');
  const ns = nameservers.map((n) => n.trim().replace(/\.$/, '')).filter(Boolean);
  if (!apex) return { ok: false, error: 'domain is required' };
  if (ns.length < 2) return { ok: false, error: 'At least two nameservers are required' };

  const res = await fetch(
    `${apiBase(creds)}/v3/domains/domain-names/${encodeURIComponent(apex)}/nameservers`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${creds.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(ns),
    },
  );

  const raw = await res.text();
  if (res.status === 202) {
    let operationUrl = res.headers.get('Location') ?? '';
    if (!operationUrl && raw) {
      try {
        const body = JSON.parse(raw) as { links?: Array<{ rel?: string; href?: string }> };
        operationUrl = body.links?.find((l) => l.rel === 'self')?.href ?? '';
      } catch {
        /* ignore */
      }
    }
    if (operationUrl) {
      const polled = await pollGoDaddyOperation(operationUrl, creds);
      if (!polled.ok) return polled;
      return { ok: true, data: { async: true, status: polled.data.status } };
    }
    return { ok: true, data: { async: true, status: 'ACCEPTED' } };
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      msg =
        (body.message as string) ||
        (body.code as string) ||
        (Array.isArray(body.errors) ? (body.errors as string[]).join('; ') : '') ||
        msg;
    } catch {
      if (raw) msg = raw.slice(0, 240);
    }
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: { async: false } };
}
