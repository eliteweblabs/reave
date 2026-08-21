import { clerkEnsureDomainProxy, clerkPublishableKey, clerkSecretKey } from './clerkClient';
import { clerkProxyUrlFromEnv, normalizeClerkProxyUrl } from './clerkProxyUrl';
import { requestOrigin } from './requestOrigin';

const CLERK_FAPI = 'https://frontend-api.clerk.dev';

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP')?.trim() ||
    request.headers.get('True-Client-IP')?.trim() ||
    request.headers.get('X-Real-IP')?.trim() ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    ''
  );
}

/** Same-origin Clerk Frontend API proxy so custom domains are not blocked by FAPI origin checks. */
export async function proxyClerkFrontendApi(request: Request): Promise<Response> {
  const secret = clerkSecretKey();
  if (!secret) {
    return new Response('Clerk is not configured', { status: 503 });
  }

  const incoming = new URL(request.url);
  const rest = incoming.pathname.replace(/^\/__clerk\/?/, '');
  const target = `${CLERK_FAPI}/${rest}${incoming.search}`;
  const proxyUrl = `${requestOrigin(request).replace(/\/$/, '')}/__clerk`;

  const headers = new Headers();
  const allow = new Set([
    'accept',
    'accept-language',
    'authorization',
    'content-type',
    'cookie',
    'origin',
    'referer',
    'user-agent',
  ]);
  for (const [key, value] of request.headers.entries()) {
    if (allow.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set('Clerk-Proxy-Url', proxyUrl);
  headers.set('Clerk-Secret-Key', secret);
  const ip = clientIp(request);
  if (ip) headers.set('X-Forwarded-For', ip);

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: rest.startsWith('npm/') ? 'follow' : 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body;
    Object.assign(init, { duplex: 'half' });
  }

  const upstream = await fetch(target, init);
  const out = new Headers(upstream.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');
  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export function isClerkFrontendProxyPath(pathname: string): boolean {
  return pathname === '/__clerk' || pathname.startsWith('/__clerk/');
}

function isPublicHttpsOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return false;
    if (host === 'localhost' || host.startsWith('127.') || host.endsWith('.internal')) return false;
    return true;
  } catch {
    return false;
  }
}

/** Absolute `https://{app-host}/__clerk` for Clerk Dashboard / Backend API. */
export function absoluteClerkFrontendProxyUrl(request: Request): string | undefined {
  const configured = clerkProxyUrlFromEnv();
  if (!configured) return undefined;
  if (/^https?:\/\//i.test(configured)) return normalizeClerkProxyUrl(configured);
  const origin = requestOrigin(request);
  if (!isPublicHttpsOrigin(origin)) return undefined;
  const path = configured.startsWith('/') ? configured : `/${configured}`;
  return `${origin.replace(/\/$/, '')}${normalizeClerkProxyUrl(path)}`;
}

let proxyRegistration: Promise<void> | undefined;

/**
 * Register `/__clerk` on the Clerk instance once per process.
 * Fire-and-forget so Clerk's own proxy probe is never blocked on the PATCH.
 */
export function scheduleClerkFrontendProxyRegistration(request: Request): void {
  if (proxyRegistration) return;
  if (clerkPublishableKey()?.startsWith('pk_test_')) return;
  const proxyUrl = absoluteClerkFrontendProxyUrl(request);
  if (!proxyUrl) return;
  proxyRegistration = clerkEnsureDomainProxy(proxyUrl)
    .then((result) => {
      if (!result.ok && !result.skipped) {
        console.warn('[clerk] Frontend API proxy URL was not registered', proxyUrl, result.error);
      }
    })
    .catch((err) => {
      console.warn('[clerk] Frontend API proxy URL registration failed', err);
    });
}
