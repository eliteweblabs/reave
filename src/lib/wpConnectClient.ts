/**
 * Reave Connect — WordPress companion plugin REST client.
 * One shared API key works on every site that has the plugin installed.
 */

export const WP_API_KEY_ENV = 'REAVE_WP_API_KEY';
export const WP_SITE_URL_ENV = 'REAVE_WP_SITE_URL';

export function getWpApiKey(): string {
  return process.env[WP_API_KEY_ENV]?.trim() ?? '';
}

export function isWpConnectConfigured(): boolean {
  return Boolean(getWpApiKey());
}

export function defaultWpSiteUrl(): string {
  return (process.env[WP_SITE_URL_ENV] ?? '').trim().replace(/\/$/, '');
}

export function resolveWpSiteUrl(explicit?: string): string {
  const raw = (explicit ?? '').trim() || defaultWpSiteUrl();
  return raw.replace(/\/$/, '');
}

export async function callWpConnect(
  siteUrl: string,
  action: string,
  params: Record<string, unknown> = {},
  apiKey?: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const key = (apiKey ?? getWpApiKey()).trim();
  if (!key) return { ok: false, error: `${WP_API_KEY_ENV} is not set` };

  const base = siteUrl.replace(/\/$/, '');
  if (!base) return { ok: false, error: 'site_url is required (or set REAVE_WP_SITE_URL)' };

  const isStatus = action === 'status';
  const url = isStatus ? `${base}/wp-json/reave/v1/status` : `${base}/wp-json/reave/v1/exec`;

  try {
    const res = await fetch(url, {
      method: isStatus ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Reave-Key': key,
        'User-Agent': 'reave-automation/1.0',
      },
      body: isStatus ? undefined : JSON.stringify({ action, params }),
      signal: AbortSignal.timeout(30_000),
    });

    const body = (await res.json().catch(() => ({
      ok: false,
      error: `HTTP ${res.status}`,
    }))) as Record<string, unknown>;
    const error = typeof body.error === 'string' ? body.error : undefined;
    return { ok: res.ok && body.ok !== false, data: body, error: res.ok ? error : error ?? `HTTP ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
