import { serverEnv } from './serverEnv';

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'localhost' || h.startsWith('127.') || h.endsWith('.internal');
}

/**
 * Public origin from the incoming request — proxy headers first, never
 * `request.url.origin` (Railway/Cloudflare SSR sees localhost there).
 */
export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
  const forwardedProto =
    request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim() || 'https';

  if (forwardedHost && !isLocalHostname(forwardedHost.split(':')[0]!)) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get('Host')?.trim();
  if (host && !isLocalHostname(host.split(':')[0]!)) {
    const proto = forwardedProto || 'https';
    return `${proto}://${host}`;
  }

  return siteOriginFallback();
}

/** Origin when no HTTP request exists (Telegram bot, background jobs). */
export function siteOriginFallback(): string {
  const railway = serverEnv('RAILWAY_PUBLIC_DOMAIN')?.trim();
  if (railway) {
    return `https://${railway.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  }
  return 'http://localhost:4321';
}

/** Public site origin — from the request when available, else Railway domain or localhost. */
export function siteBaseUrl(request?: Request): string {
  return request ? requestOrigin(request) : siteOriginFallback();
}
