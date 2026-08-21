/**
 * Same-origin Clerk Frontend API proxy (`/__clerk`).
 *
 * Production publishable keys encode a `clerk.{apex}` Frontend API host. When
 * that hostname is on a WordPress/Kinsta (or orange-cloud) zone, clerk-js 404s
 * and CORS-blocks. The Node proxy already forwards `/__clerk` to Clerk; this
 * helper is how the browser SDK is told to use it.
 *
 * Clerk does not support proxying on development instances (`pk_test_`).
 */

export const DEFAULT_CLERK_FRONTEND_PROXY_PATH = '/__clerk';
/**
 * Installed admin PWA scope is `/admin`. Clerk document handshakes must stay
 * under this path or iOS opens Safari and the session never returns.
 */
export const ADMIN_SCOPED_CLERK_PROXY_PATH = '/admin/__clerk';

const PROXY_OFF = new Set(['0', 'false', 'off', 'none']);

export function isClerkProxyOptOut(value: string | undefined): boolean {
  return Boolean(value && PROXY_OFF.has(value.trim().toLowerCase()));
}

function publishableKeyFromEnv(env: NodeJS.ProcessEnv): string {
  return (
    env.PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    env.CLERK_PUBLISHABLE_KEY?.trim() ||
    env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ||
    ''
  );
}

/**
 * Proxy URL for `@clerk/astro` / clerk-js.
 * Relative `/__clerk` is valid and stays host-agnostic.
 */
export function clerkProxyUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const raw = env.PUBLIC_CLERK_PROXY_URL?.trim();
  if (raw && isClerkProxyOptOut(raw)) return undefined;
  if (raw) return raw;
  if (publishableKeyFromEnv(env).startsWith('pk_test_')) return undefined;
  return DEFAULT_CLERK_FRONTEND_PROXY_PATH;
}

export function normalizeClerkProxyUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function clerkProxyUrlsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizeClerkProxyUrl(a) === normalizeClerkProxyUrl(b);
}
