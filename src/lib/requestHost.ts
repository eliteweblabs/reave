/**
 * Public hostname for the in-flight request.
 * Homepage chrome uses this so a client domain never inherits reave.app marketing
 * just because INSTALL_CONFIG was copied as `reave`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { serverEnv } from './serverEnv';

const requestHostContext = new AsyncLocalStorage<string>();

export function normalizePublicHost(raw?: string | null): string {
  return (
    (raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0]
      ?.replace(/\.+$/, '')
      ?.replace(/^www\./, '') || ''
  );
}

/** Hostname only (no port). FQDN trailing dots are valid DNS but break host matching. */
export function hostnameFromHostHeader(raw?: string | null): string {
  return (raw ?? '').trim().split(':')[0] || '';
}

/** `reave.app.` / `www.example.com.` → hostname without the FQDN terminator. */
export function stripTrailingFqdnDot(host: string): string {
  return hostnameFromHostHeader(host).replace(/\.+$/, '');
}

export function isReaveMarketingHost(host: string): boolean {
  return normalizePublicHost(host) === 'reave.app';
}

export function publicHostFromRequest(request: Request): string {
  const forwarded = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
  const host = forwarded || request.headers.get('Host')?.trim() || '';
  return normalizePublicHost(host);
}

/** Install domain from Railway variables — used when SSR headers are localhost. */
export function publicHostFromEnv(): string {
  return normalizePublicHost(
    serverEnv('COMPANY_DOMAIN') || serverEnv('PUBLIC_SITE_DOMAIN') || serverEnv('PUBLIC_SITE_URL'),
  );
}

export function resolvePublicHost(request?: Request): string {
  return (request ? publicHostFromRequest(request) : '') || getRequestPublicHost() || publicHostFromEnv();
}

export function runWithRequestHost<T>(host: string, fn: () => T): T {
  return requestHostContext.run(normalizePublicHost(host), fn);
}

export function getRequestPublicHost(): string {
  return requestHostContext.getStore() || '';
}
