/**
 * Shared fetch helper for bootstrap satellite APIs (materials-api, inventory-api, …).
 */
import { serverEnv } from './serverEnv';

export type ExternalApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export type ExternalApiClient = {
  isConfigured: () => boolean;
  fetch: <T>(path: string, init: { method: string; body?: unknown }) => Promise<ExternalApiResult<T>>;
};

export function createExternalApiClient(opts: {
  baseUrlEnv: string;
  apiKeyEnv: string;
  notConfiguredMessage: string;
}): ExternalApiClient {
  function baseUrl(): string | null {
    const raw = serverEnv(opts.baseUrlEnv)?.trim();
    if (!raw) return null;
    return raw.replace(/\/+$/, '');
  }

  function authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
    const key = serverEnv(opts.apiKeyEnv)?.trim();
    if (key) headers['X-API-Key'] = key;
    return headers;
  }

  async function fetchApi<T>(
    path: string,
    init: { method: string; body?: unknown },
  ): Promise<ExternalApiResult<T>> {
    const base = baseUrl();
    if (!base) return { ok: false, error: opts.notConfiguredMessage };

    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        method: init.method,
        headers: authHeaders(),
        body: init.body != null ? JSON.stringify(init.body) : undefined,
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
        parsed = { raw: text.slice(0, 500) };
      }
    }

    if (!res.ok || (parsed && typeof parsed === 'object' && (parsed as { ok?: boolean }).ok === false)) {
      const msg =
        (parsed as { error?: string })?.error ||
        text.slice(0, 300) ||
        res.statusText ||
        `HTTP ${res.status}`;
      return { ok: false, error: msg, status: res.status };
    }

    return { ok: true, data: parsed as T };
  }

  return {
    isConfigured: () => Boolean(baseUrl()),
    fetch: fetchApi,
  };
}
