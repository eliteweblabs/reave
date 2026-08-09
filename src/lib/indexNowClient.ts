/**
 * IndexNow — notify Bing/Yandex/etc. of URL changes (not Google).
 * Key must be hosted on the target site (or keyLocation URL provided).
 */
import { AnalyticsApiError } from './googleWebmasterAuth';
import { serverEnv } from './serverEnv.ts';

export function indexNowKey(): string | null {
  return serverEnv('INDEXNOW_KEY')?.trim() || null;
}

export function isIndexNowConfigured(): boolean {
  return Boolean(indexNowKey());
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export async function indexNowSubmit(args: {
  host: string;
  urlList: string[];
  key?: string;
  keyLocation?: string;
}): Promise<{ ok: true; status: number } | { ok: false; error: string; status?: number }> {
  const key = (args.key || indexNowKey() || '').trim();
  if (!key) {
    return {
      ok: false,
      error: 'INDEXNOW_KEY is not configured (and no key was passed). Only use IndexNow on sites you control.',
    };
  }
  const host = args.host.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const urlList = args.urlList.map((u) => u.trim()).filter(Boolean);
  if (!host || !urlList.length) {
    return { ok: false, error: 'host and urlList are required' };
  }

  const body: Record<string, unknown> = {
    host,
    key,
    urlList,
  };
  if (args.keyLocation) body.keyLocation = args.keyLocation;

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    });
    // 200 / 202 = accepted
    if (res.status === 200 || res.status === 202) {
      return { ok: true, status: res.status };
    }
    const text = await res.text();
    return {
      ok: false,
      status: res.status,
      error: `IndexNow ${res.status}: ${text.slice(0, 300) || res.statusText}`,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'IndexNow request failed',
    };
  }
}

export function inferIndexNowHost(urls: string[]): string | null {
  for (const u of urls) {
    const h = hostFromUrl(u);
    if (h) return h;
  }
  return null;
}

export function indexNowNotConfiguredError(): never {
  throw new AnalyticsApiError(
    'IndexNow is not configured. Set INDEXNOW_KEY and host the key file on the target site.',
  );
}
