/**
 * ChangeDetection.io REST API client (self-hosted on Railway or elsewhere).
 *
 * Docs: https://changedetection.io/docs/api_v1/
 */
import { serverEnv } from './serverEnv';

export type CdWatch = {
  uuid: string;
  url?: string;
  title?: string;
  paused?: boolean;
  last_checked?: string;
  last_changed?: string;
};

function baseUrl(): string | null {
  const raw = serverEnv('CHANGEDETECTION_BASE_URL')?.trim().replace(/\/+$/, '');
  return raw || null;
}

function apiKey(): string | null {
  return serverEnv('CHANGEDETECTION_API_KEY')?.trim() || null;
}

export function isChangeDetectionConfigured(): boolean {
  return Boolean(baseUrl() && apiKey());
}

function apiRoot(): string {
  const base = baseUrl();
  if (!base) throw new Error('CHANGEDETECTION_BASE_URL is not set');
  return `${base}/api/v1`;
}

async function cdFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const key = apiKey();
  if (!key) throw new Error('CHANGEDETECTION_API_KEY is not set');

  const headers = new Headers(init.headers);
  headers.set('x-api-key', key);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`${apiRoot()}${path}`, { ...init, headers });
  return res;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function cdCreateWatch(input: {
  url: string;
  title?: string;
  tag?: string;
  notificationUrls?: string[];
  checkHours?: number;
}): Promise<{ ok: true; uuid: string } | { ok: false; error: string }> {
  if (!isChangeDetectionConfigured()) {
    return { ok: false, error: 'ChangeDetection.io is not configured' };
  }

  const hours = input.checkHours ?? (Number(serverEnv('CHANGEDETECTION_CHECK_HOURS') || 24) || 24);
  const body: Record<string, unknown> = {
    url: input.url,
    title: input.title ?? input.url,
    time_between_check: { hours: Math.max(1, Math.min(hours, 168)) },
  };
  if (input.tag) body.tag = input.tag;
  if (input.notificationUrls?.length) body.notification_urls = input.notificationUrls;

  try {
    const res = await cdFetch('/watch', { method: 'POST', body: JSON.stringify(body) });
    const json = (await parseJson(res)) as { uuid?: string; error?: string } | null;
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && json.error
          ? String(json.error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    const uuid = json && typeof json === 'object' ? json.uuid : undefined;
    if (!uuid) return { ok: false, error: 'Create watch returned no uuid' };
    return { ok: true, uuid };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cdUpdateWatch(
  uuid: string,
  patch: {
    url?: string;
    title?: string;
    paused?: boolean;
    notificationUrls?: string[];
    checkHours?: number;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isChangeDetectionConfigured()) {
    return { ok: false, error: 'ChangeDetection.io is not configured' };
  }
  if (!uuid?.trim()) return { ok: false, error: 'watch uuid is required' };

  const body: Record<string, unknown> = {};
  if (patch.url) body.url = patch.url;
  if (patch.title) body.title = patch.title;
  if (typeof patch.paused === 'boolean') body.paused = patch.paused;
  if (patch.notificationUrls) body.notification_urls = patch.notificationUrls;
  if (patch.checkHours != null) {
    body.time_between_check = { hours: Math.max(1, Math.min(patch.checkHours, 168)) };
  }

  try {
    const res = await cdFetch(`/watch/${encodeURIComponent(uuid.trim())}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const json = (await parseJson(res)) as { error?: string } | null;
      const err =
        json && typeof json === 'object' && json.error
          ? String(json.error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cdDeleteWatch(
  uuid: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isChangeDetectionConfigured()) {
    return { ok: false, error: 'ChangeDetection.io is not configured' };
  }
  if (!uuid?.trim()) return { ok: false, error: 'watch uuid is required' };

  try {
    const res = await cdFetch(`/watch/${encodeURIComponent(uuid.trim())}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) {
      const json = (await parseJson(res)) as { error?: string } | null;
      const err =
        json && typeof json === 'object' && json.error
          ? String(json.error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Trigger an immediate recheck (updates baseline after deploy). */
export async function cdRecheckWatch(
  uuid: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isChangeDetectionConfigured()) {
    return { ok: false, error: 'ChangeDetection.io is not configured' };
  }
  if (!uuid?.trim()) return { ok: false, error: 'watch uuid is required' };

  try {
    const res = await cdFetch(
      `/watch/${encodeURIComponent(uuid.trim())}?recheck=1`,
      { method: 'GET' },
    );
    if (!res.ok) {
      const json = (await parseJson(res)) as { error?: string } | null;
      const err =
        json && typeof json === 'object' && json.error
          ? String(json.error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cdGetWatch(
  uuid: string,
): Promise<{ ok: true; watch: CdWatch } | { ok: false; error: string }> {
  if (!isChangeDetectionConfigured()) {
    return { ok: false, error: 'ChangeDetection.io is not configured' };
  }

  try {
    const res = await cdFetch(`/watch/${encodeURIComponent(uuid.trim())}`, { method: 'GET' });
    const json = await parseJson(res);
    if (!res.ok) {
      const err =
        json && typeof json === 'object' && 'error' in json
          ? String((json as { error: unknown }).error)
          : `HTTP ${res.status}`;
      return { ok: false, error: err };
    }
    if (!json || typeof json !== 'object') {
      return { ok: false, error: 'Unexpected watch response' };
    }
    const o = json as Record<string, unknown>;
    const id = String(o.uuid ?? uuid);
    return {
      ok: true,
      watch: {
        uuid: id,
        url: typeof o.url === 'string' ? o.url : undefined,
        title: typeof o.title === 'string' ? o.title : undefined,
        paused: o.paused === true || o.paused === 'True',
        last_checked: typeof o.last_checked === 'string' ? o.last_checked : undefined,
        last_changed: typeof o.last_changed === 'string' ? o.last_changed : undefined,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Build Apprise jsons:// notification URL for change alerts → Reave webhook. */
export function changeDetectionNotificationUrl(watchUuid: string): string | null {
  const domain = serverEnv('RAILWAY_PUBLIC_DOMAIN')?.trim() || serverEnv('PUBLIC_SITE_DOMAIN')?.trim();
  const secret = serverEnv('CHANGEDETECTION_WEBHOOK_SECRET')?.trim();
  if (!domain || !secret) return null;

  const host = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const qs = new URLSearchParams({ key: secret, watch: watchUuid });
  return `jsons://${host}/api/monitoring/changedetection?${qs.toString()}`;
}
