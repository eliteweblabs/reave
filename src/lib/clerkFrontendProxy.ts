import { clerkEnsureDomainProxy, clerkFrontendApiHost, clerkFrontendApiOrigin, clerkSecretKey } from './clerkClient';
import { DEFAULT_CLERK_FRONTEND_PROXY_PATH } from './clerkProxyUrl';
import { publicHostFromEnv } from './requestHost';

/** Official Clerk Frontend API — required when using a same-origin proxy. */
export const CLERK_OFFICIAL_FRONTEND_API_ORIGIN = 'https://frontend-api.clerk.dev';

const HOP_BY_HOP = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

function clientIp(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP')?.trim() ||
    request.headers.get('True-Client-IP')?.trim() ||
    request.headers.get('X-Real-IP')?.trim() ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    ''
  );
}

/**
 * Absolute proxy URL Clerk expects in `Clerk-Proxy-Url` (and on the domain
 * record). Relative `/__clerk` is fine for clerk-js; the FAPI proxy header
 * must be a full URL.
 */
export function absoluteClerkProxyUrl(request: Request): string {
  const incoming = new URL(request.url);
  const proto =
    request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim() ||
    incoming.protocol.replace(':', '') ||
    'https';
  const host =
    request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim() ||
    request.headers.get('Host')?.trim() ||
    incoming.host;
  return `${proto}://${host}${DEFAULT_CLERK_FRONTEND_PROXY_PATH}`;
}

export function clerkProxyRequestHeaders(request: Request, proxyUrl: string): Headers {
  const headers = new Headers();
  for (const [key, value] of request.headers.entries()) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  }
  headers.set('Clerk-Proxy-Url', proxyUrl);
  const secret = clerkSecretKey();
  if (secret) headers.set('Clerk-Secret-Key', secret);
  const ip = clientIp(request);
  if (ip) headers.set('X-Forwarded-For', ip);
  return headers;
}

export function isClerkFrontendApiHost(hostname: string, extraHosts: string[] = []): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host) return false;
  if (host === 'frontend-api.clerk.dev' || host === 'frontend-api.clerk.com') return true;
  if (host.endsWith('.clerk.accounts.dev')) return true;
  if (extraHosts.some((item) => item.trim().toLowerCase() === host)) return true;
  return host.startsWith('clerk.');
}

/** Keep handshake redirects on the same-origin proxy instead of clerk.{apex}. */
export function rewriteClerkProxyLocation(
  location: string,
  requestUrl: string,
  extraFapiHosts: string[] = [],
): string {
  let url: URL;
  try {
    url = new URL(location, requestUrl);
  } catch {
    return location;
  }
  const incoming = new URL(requestUrl);
  if (url.host === incoming.host) return location;
  if (!isClerkFrontendApiHost(url.hostname, extraFapiHosts)) return location;
  const path = url.pathname.startsWith(DEFAULT_CLERK_FRONTEND_PROXY_PATH)
    ? url.pathname
    : `${DEFAULT_CLERK_FRONTEND_PROXY_PATH}${url.pathname.startsWith('/') ? url.pathname : `/${url.pathname}`}`;
  return `${incoming.origin}${path}${url.search}${url.hash}`;
}

/** Drop Domain= so `__client` is stored on the app host, not clerk.{apex}. */
export function rewriteClerkProxySetCookie(cookie: string): string {
  return cookie.replace(/;\s*Domain=[^;]*/gi, '');
}

async function isOfficialProxyRejected(response: Response): Promise<boolean> {
  if (response.status !== 400 && response.status !== 403) return false;
  const text = await response
    .clone()
    .text()
    .catch(() => '');
  return /host_invalid|invalid_proxy|proxy_url/i.test(text);
}

let ensureProxyPromise: Promise<void> | null = null;

/**
 * Register this install's `/__clerk` URL on the Clerk domain (non-blocking).
 * Must not be awaited on the `/__clerk` path — Clerk validates the URL by
 * calling back into this proxy, which would deadlock.
 */
export function ensureClerkDomainProxy(proxyUrl?: string): void {
  const fromEnv = publicHostFromEnv()
    ? `https://${publicHostFromEnv()}${DEFAULT_CLERK_FRONTEND_PROXY_PATH}`
    : '';
  const wanted = fromEnv || proxyUrl || '';
  if (!wanted.startsWith('https://')) return;
  if (ensureProxyPromise) return;
  ensureProxyPromise = clerkEnsureDomainProxy(wanted)
    .then((result) => {
      if (!result.ok && !result.skipped) {
        console.warn('[clerk-proxy] domain proxy_url not saved:', result.error);
      }
    })
    .catch((err) => {
      console.warn('[clerk-proxy] domain proxy_url failed', err);
    });
}

/**
 * Same-origin Clerk Frontend API proxy so client domains can sign in without a
 * per-host `clerk.*` CNAME.
 *
 * Official proxy mode: forward to `frontend-api.clerk.dev` with
 * `Clerk-Proxy-Url`, `Clerk-Secret-Key`, and `X-Forwarded-For`. Hitting the
 * instance FAPI host without those headers leaves `__client` on clerk.{apex},
 * so `prepare_first_factor` (SMS OTP) 401s and no text is sent.
 */
export async function proxyClerkFrontendApi(request: Request): Promise<Response> {
  const instanceOrigin = clerkFrontendApiOrigin();
  if (!instanceOrigin && !clerkSecretKey()) {
    return new Response('Clerk is not configured', { status: 503 });
  }

  const incoming = new URL(request.url);
  const rest = incoming.pathname.replace(/^\/__clerk\/?/, '');
  const proxyUrl = absoluteClerkProxyUrl(request);
  ensureClerkDomainProxy(proxyUrl);

  const headers = clerkProxyRequestHeaders(request, proxyUrl);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: rest.startsWith('npm/') ? 'follow' : 'manual',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body;
    Object.assign(init, { duplex: 'half' });
  }

  const officialTarget = `${CLERK_OFFICIAL_FRONTEND_API_ORIGIN}/${rest}${incoming.search}`;
  const instanceTarget = instanceOrigin ? `${instanceOrigin}/${rest}${incoming.search}` : '';

  let upstream: Response;
  if (clerkSecretKey()) {
    upstream = await fetch(officialTarget, init);
    if ((await isOfficialProxyRejected(upstream)) && instanceTarget) {
      upstream = await fetch(instanceTarget, init);
    }
  } else if (instanceTarget) {
    upstream = await fetch(instanceTarget, init);
  } else {
    return new Response('Clerk is not configured', { status: 503 });
  }

  if (upstream.status >= 400 && rest.startsWith('v1/')) {
    const snippet = await upstream
      .clone()
      .text()
      .then((text) => text.slice(0, 300))
      .catch(() => '');
    console.warn('[clerk-proxy]', request.method, rest, upstream.status, snippet);
  }

  const out = new Headers(upstream.headers);
  out.delete('content-encoding');
  out.delete('content-length');
  out.delete('transfer-encoding');

  const location = out.get('location');
  if (location) {
    const extra = clerkFrontendApiHost() ? [clerkFrontendApiHost() as string] : [];
    out.set('location', rewriteClerkProxyLocation(location, request.url, extra));
  }

  const cookies = typeof out.getSetCookie === 'function' ? out.getSetCookie() : [];
  if (cookies.length) {
    out.delete('set-cookie');
    for (const cookie of cookies) {
      out.append('set-cookie', rewriteClerkProxySetCookie(cookie));
    }
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: out,
  });
}

export function isClerkFrontendProxyPath(pathname: string): boolean {
  return pathname === '/__clerk' || pathname.startsWith('/__clerk/');
}
