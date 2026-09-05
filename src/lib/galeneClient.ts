/**
 * Galene administrative API client (`/galene-api/v0/`).
 *
 * Authenticates with HTTP Basic using GALENE_ADMIN_USERNAME + GALENE_ADMIN_PASSWORD.
 * Room URLs are `/group/{name}/` on the public Galene host (GALENE_API_BASE_URL).
 */
import { serverEnv } from './serverEnv';

function baseUrl(): string | null {
  const raw = serverEnv('GALENE_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function adminUsername(): string {
  return serverEnv('GALENE_ADMIN_USERNAME')?.trim() || 'admin';
}

function adminPassword(): string | null {
  return serverEnv('GALENE_ADMIN_PASSWORD')?.trim() || null;
}

export function isGaleneConfigured(): boolean {
  return Boolean(baseUrl() && adminPassword());
}

type GaleneResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type GaleneFetchInit = {
  method: string;
  body?: unknown;
  contentType?: string;
  headers?: Record<string, string>;
};

function basicAuthHeader(): string | null {
  const user = adminUsername();
  const pass = adminPassword();
  if (!pass) return null;
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function galeneFetch<T>(path: string, init: GaleneFetchInit): Promise<GaleneResult<T>> {
  const base = baseUrl();
  const auth = basicAuthHeader();
  if (!base) return { ok: false, error: 'GALENE_API_BASE_URL is not set' };
  if (!auth) return { ok: false, error: 'GALENE_ADMIN_PASSWORD is not set' };

  const url = `${base}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        Accept: 'application/json',
        Authorization: auth,
        ...(init.contentType ? { 'Content-Type': init.contentType } : {}),
        ...(init.headers ?? {}),
      },
      body:
        init.body == null
          ? undefined
          : typeof init.body === 'string'
            ? init.body
            : JSON.stringify(init.body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const obj = parsed as { error?: string; message?: string } | undefined;
    const msg = obj?.error || obj?.message || text.slice(0, 200) || `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: parsed as T };
}

export function galeneRoomUrl(groupName: string): string | null {
  const base = baseUrl();
  if (!base) return null;
  const slug = encodeURIComponent(groupName.trim());
  return `${base}/group/${slug}/`;
}

export async function galeneListGroups(): Promise<GaleneResult<string[]>> {
  return galeneFetch<string[]>('/galene-api/v0/.groups/', { method: 'GET' });
}

export type GaleneGroupDefinition = {
  displayName?: string;
  description?: string;
  public?: boolean;
  'max-clients'?: number;
  'allow-recording'?: boolean;
  autolock?: boolean;
  'unrestricted-tokens'?: boolean;
};

export async function galeneCreateGroup(
  groupName: string,
  def: GaleneGroupDefinition = {},
): Promise<GaleneResult<{ group: string; url: string }>> {
  const name = groupName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!name) return { ok: false, error: 'group name is required' };

  const body: GaleneGroupDefinition = {
    displayName: def.displayName ?? name,
    description: def.description ?? 'reave.app video room',
    public: def.public ?? true,
    'max-clients': def['max-clients'] ?? 40,
    'allow-recording': def['allow-recording'] ?? true,
    autolock: def.autolock ?? false,
    'unrestricted-tokens': def['unrestricted-tokens'] ?? true,
  };

  const created = await galeneFetch<unknown>(`/galene-api/v0/.groups/${encodeURIComponent(name)}/`, {
    method: 'PUT',
    contentType: 'application/json',
    headers: { 'If-None-Match': '*' },
    body,
  });
  if (!created.ok) return created;

  const hostPassword = serverEnv('GALENE_GROUP_PASSWORD')?.trim() || 'meet';
  const hostPw = await galeneFetch<unknown>(
    `/galene-api/v0/.groups/${encodeURIComponent(name)}/.users/host/.password`,
    { method: 'POST', contentType: 'text/plain', body: hostPassword },
  );
  if (!hostPw.ok) return hostPw;

  const hostPerms = await galeneFetch<unknown>(
    `/galene-api/v0/.groups/${encodeURIComponent(name)}/.users/host/`,
    { method: 'PUT', contentType: 'application/json', body: { permissions: 'op' } },
  );
  if (!hostPerms.ok) return hostPerms;

  const wildcardPw = await galeneFetch<unknown>(
    `/galene-api/v0/.groups/${encodeURIComponent(name)}/.wildcard-user/.password`,
    { method: 'PUT', contentType: 'application/json', body: { type: 'wildcard' } },
  );
  if (!wildcardPw.ok) return wildcardPw;

  const wildcardPerms = await galeneFetch<unknown>(
    `/galene-api/v0/.groups/${encodeURIComponent(name)}/.wildcard-user/`,
    { method: 'PUT', contentType: 'application/json', body: { permissions: 'present' } },
  );
  if (!wildcardPerms.ok) return wildcardPerms;

  const url = galeneRoomUrl(name);
  return { ok: true, data: { group: name, url: url ?? `${baseUrl()}/group/${name}/` } };
}

export type GaleneInviteInput = {
  group: string;
  username?: string;
  expiresInDays?: number;
};

export type GaleneInvite = {
  group: string;
  token: string;
  url: string;
  expires?: string;
};

export async function galeneCreateInvite(input: GaleneInviteInput): Promise<GaleneResult<GaleneInvite>> {
  const group = input.group.trim();
  if (!group) return { ok: false, error: 'group is required' };

  const template: Record<string, unknown> = { permissions: ['present'] };
  if (input.username?.trim()) template.username = input.username.trim();

  const days = input.expiresInDays ?? 7;
  if (days > 0) {
    const expires = new Date();
    expires.setDate(expires.getDate() + days);
    template.expires = expires.toISOString();
  }

  const base = baseUrl();
  const auth = basicAuthHeader();
  if (!base || !auth) return { ok: false, error: 'Galene is not configured' };

  let res: Response;
  try {
    res = await fetch(`${base}/galene-api/v0/.groups/${encodeURIComponent(group)}/.tokens/`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(template),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: text.slice(0, 200) || `HTTP ${res.status}`, status: res.status };
  }

  const location = res.headers.get('Location') ?? '';
  const tokenName = location.split('/').filter(Boolean).pop() ?? '';
  if (!tokenName) return { ok: false, error: 'Galene did not return a token name' };

  const tokenRes = await galeneFetch<{ token?: string; expires?: string }>(
    `/galene-api/v0/.groups/${encodeURIComponent(group)}/.tokens/${encodeURIComponent(tokenName)}`,
    { method: 'GET' },
  );
  if (!tokenRes.ok) return tokenRes;

  const tokenStr = tokenRes.data.token ?? tokenName;
  const room = galeneRoomUrl(group);
  const url = room
    ? `${room}?token=${encodeURIComponent(tokenStr)}`
    : `${base}/group/${encodeURIComponent(group)}/?token=${encodeURIComponent(tokenStr)}`;

  return {
    ok: true,
    data: {
      group,
      token: tokenStr,
      url,
      expires: tokenRes.data.expires,
    },
  };
}
