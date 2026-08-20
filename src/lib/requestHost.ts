/**
 * Public hostname for the in-flight request.
 * Homepage chrome uses this so a client domain never inherits REΛVE marketing
 * just because INSTALL_CONFIG was copied as `reave`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const requestHostContext = new AsyncLocalStorage<string>();

export function normalizePublicHost(raw?: string | null): string {
  return (
    (raw ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      ?.split(':')[0]
      ?.replace(/^www\./, '') || ''
  );
}

export function isReaveMarketingHost(host: string): boolean {
  return normalizePublicHost(host) === 'reave.app';
}

export function publicHostFromRequest(request: Request): string {
  const forwarded = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
  const host = forwarded || request.headers.get('Host')?.trim() || '';
  return normalizePublicHost(host);
}

export function runWithRequestHost<T>(host: string, fn: () => T): T {
  return requestHostContext.run(normalizePublicHost(host), fn);
}

export function getRequestPublicHost(): string {
  return requestHostContext.getStore() || '';
}
