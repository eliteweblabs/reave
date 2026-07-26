/**
 * Cloudflare Zone Settings API client.
 * Covers zone-level toggles: email obfuscation, security headers,
 * SSL mode, minification, cache level, browser cache TTL, hotlink protection,
 * rocket loader, early hints, and more.
 *
 * Requires CLOUDFLARE_API_TOKEN with Zone → Settings → Edit permission.
 */
import { serverEnv } from './serverEnv.ts';
import { cloudflareFindZone, cloudflareVerifyToken, type CfResult } from './cloudflareClient.ts';

const CF_API = 'https://api.cloudflare.com/client/v4';

function token(): string | undefined {
  return serverEnv('CLOUDFLARE_API_TOKEN')?.trim();
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfResult<T>> {
  const apiToken = token();
  if (!apiToken) return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };

  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: { success?: boolean; errors?: { message: string }[]; result?: T };
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

// ---------------------------------------------------------------------------
// Zone resolution helper
// ---------------------------------------------------------------------------

export async function resolveZoneId(domain: string): Promise<CfResult<string>> {
  // Strip protocol and path, get apex domain
  const hostname = domain.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  const apex = parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
  const zone = await cloudflareFindZone(apex);
  if (!zone.ok) return zone;
  return { ok: true, data: zone.data.id };
}

// ---------------------------------------------------------------------------
// Zone setting types
// ---------------------------------------------------------------------------

export type CfSettingValue = string | boolean | number | Record<string, unknown>;

export type CfZoneSetting = {
  id: string;
  value: CfSettingValue;
  modified_on?: string;
  editable?: boolean;
};

// ---------------------------------------------------------------------------
// Get a single zone setting
// ---------------------------------------------------------------------------

export async function cloudflareGetSetting(
  zoneId: string,
  settingId: string,
): Promise<CfResult<CfZoneSetting>> {
  return cfFetch<CfZoneSetting>(`/zones/${zoneId}/settings/${settingId}`);
}

// ---------------------------------------------------------------------------
// Patch a single zone setting
// ---------------------------------------------------------------------------

export async function cloudflareSetSetting(
  zoneId: string,
  settingId: string,
  value: CfSettingValue,
): Promise<CfResult<CfZoneSetting>> {
  return cfFetch<CfZoneSetting>(`/zones/${zoneId}/settings/${settingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}

// ---------------------------------------------------------------------------
// List all zone settings
// ---------------------------------------------------------------------------

export async function cloudflareListSettings(
  zoneId: string,
): Promise<CfResult<CfZoneSetting[]>> {
  return cfFetch<CfZoneSetting[]>(`/zones/${zoneId}/settings`);
}

// ---------------------------------------------------------------------------
// Security Headers (Managed Transform Rules)
// Cloudflare exposes security headers via the Zone Settings → security_header
// setting (STS/HSTS only). Full response headers go through Transform Rules.
// ---------------------------------------------------------------------------

export type HstsConfig = {
  enabled: boolean;
  max_age?: number;            // seconds, e.g. 31536000
  include_subdomains?: boolean;
  preload?: boolean;
  nosniff?: boolean;           // X-Content-Type-Options
};

export async function cloudflareGetHsts(zoneId: string): Promise<CfResult<CfZoneSetting>> {
  return cloudflareGetSetting(zoneId, 'security_header');
}

export async function cloudflareSetHsts(
  zoneId: string,
  cfg: HstsConfig,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'security_header', {
    strict_transport_security: {
      enabled: cfg.enabled,
      max_age: cfg.max_age ?? 31536000,
      include_subdomains: cfg.include_subdomains ?? true,
      preload: cfg.preload ?? false,
      nosniff: cfg.nosniff ?? true,
    },
  });
}

// ---------------------------------------------------------------------------
// Managed Security Headers Transform Rule
// Enables Cloudflare's built-in "Add security headers" managed ruleset.
// Covers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
//         Referrer-Policy, Permissions-Policy, CSP.
// ---------------------------------------------------------------------------

type ManagedTransformRule = { id: string; enabled: boolean };

export async function cloudflareListManagedTransforms(
  zoneId: string,
): Promise<CfResult<{ managed_request_header_transforms: ManagedTransformRule[]; managed_response_header_transforms: ManagedTransformRule[] }>> {
  return cfFetch(`/zones/${zoneId}/managed_headers`);
}

export async function cloudflareEnableSecurityHeaders(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<unknown>> {
  // Cloudflare's "Add security headers" managed ruleset id
  const SECURITY_HEADERS_ID = 'add_security_headers';
  return cfFetch(`/zones/${zoneId}/managed_headers`, {
    method: 'PATCH',
    body: JSON.stringify({
      managed_response_header_transforms: [{ id: SECURITY_HEADERS_ID, enabled }],
    }),
  });
}

// ---------------------------------------------------------------------------
// Common convenience toggles
// ---------------------------------------------------------------------------

/** Toggle Scrape Shield email address obfuscation. */
export async function cloudflareSetEmailObfuscation(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'email_obfuscation', enabled ? 'on' : 'off');
}

/** Toggle Server Side Excludes (SSE). */
export async function cloudflareSetSSE(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'server_side_exclude', enabled ? 'on' : 'off');
}

/** Toggle Hotlink Protection. */
export async function cloudflareSetHotlinkProtection(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'hotlink_protection', enabled ? 'on' : 'off');
}

/** Toggle Rocket Loader (async JS). */
export async function cloudflareSetRocketLoader(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'rocket_loader', enabled ? 'on' : 'off');
}

/** Toggle Early Hints. */
export async function cloudflareSetEarlyHints(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'early_hints', enabled ? 'on' : 'off');
}

/** Toggle HTTP/2. */
export async function cloudflareSetHttp2(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'http2', enabled ? 'on' : 'off');
}

/** Toggle HTTP/3 / QUIC. */
export async function cloudflareSetHttp3(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'http3', enabled ? 'on' : 'off');
}

/** Toggle 0-RTT. */
export async function cloudflareSet0rtt(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, '0rtt', enabled ? 'on' : 'off');
}

/** Toggle Auto Minify for JS/CSS/HTML. */
export async function cloudflareSetMinify(
  zoneId: string,
  opts: { js?: boolean; css?: boolean; html?: boolean },
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'minify', {
    js: opts.js ? 'on' : 'off',
    css: opts.css ? 'on' : 'off',
    html: opts.html ? 'on' : 'off',
  });
}

/** Set SSL mode: off | flexible | full | strict */
export async function cloudflareSetSsl(
  zoneId: string,
  mode: 'off' | 'flexible' | 'full' | 'strict',
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'ssl', mode);
}

/** Set cache level: bypass | basic | simplified | aggressive | cache_everything */
export async function cloudflareSetCacheLevel(
  zoneId: string,
  level: 'bypass' | 'basic' | 'simplified' | 'aggressive' | 'cache_everything',
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'cache_level', level);
}

/** Set browser cache TTL in seconds (0 = respect origin headers). */
export async function cloudflareSetBrowserCacheTtl(
  zoneId: string,
  ttl: number,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'browser_cache_ttl', ttl);
}

/** Toggle Always Use HTTPS (redirects all HTTP to HTTPS). */
export async function cloudflareSetAlwaysHttps(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'always_use_https', enabled ? 'on' : 'off');
}

/** Toggle Brotli compression. */
export async function cloudflareSetBrotli(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'brotli', enabled ? 'on' : 'off');
}

/** Toggle Polish (image optimization). Requires Pro plan.
 *  mode: off | lossless | lossy */
export async function cloudflareSetPolish(
  zoneId: string,
  mode: 'off' | 'lossless' | 'lossy',
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'polish', mode);
}

/** Toggle WebP conversion (requires Polish != off). */
export async function cloudflareSetWebp(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'webp', enabled ? 'on' : 'off');
}

/** Toggle Mirage (mobile image optimization). Requires Pro plan. */
export async function cloudflareSetMirage(
  zoneId: string,
  enabled: boolean,
): Promise<CfResult<CfZoneSetting>> {
  return cloudflareSetSetting(zoneId, 'mirage', enabled ? 'on' : 'off');
}

// Re-export verify for convenience
export { cloudflareVerifyToken };
