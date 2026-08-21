import { setDefaultResultOrder } from 'node:dns';
import { clerkEnsureDomainProxy, clerkFrontendApiHost, clerkFrontendApiOrigin, clerkSecretKey } from './clerkClient';
import { ADMIN_SCOPED_CLERK_PROXY_PATH, DEFAULT_CLERK_FRONTEND_PROXY_PATH } from './clerkProxyUrl';
import { publicHostFromEnv } from './requestHost';

/** Official Clerk Frontend API — required when using a same-origin proxy. */
export const CLERK_OFFICIAL_FRONTEND_API_ORIGIN = 'https://frontend-api.clerk.dev';

// Railway → Cloudflare (Clerk) often fails on IPv6 (undici TypeError: fetch failed).
setDefaultResultOrder('ipv4first');

const FORWARD_HEADERS = new Set([
  'accept',
  'accept-language',
  'clerk-api-version',
  'content-type',
  'cookie',
  'origin',
  'referer',
  'user-agent',
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
    if (FORWARD_HEADERS.has(key.toLowerCase())) headers.set(key, value);
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

function adminScopedClerkProxyPath(pathname: string): string {
  if (pathname === ADMIN_SCOPED_CLERK_PROXY_PATH || pathname.startsWith(`${ADMIN_SCOPED_CLERK_PROXY_PATH}/`)) {
    return pathname;
  }
  if (pathname === DEFAULT_CLERK_FRONTEND_PROXY_PATH || pathname.startsWith(`${DEFAULT_CLERK_FRONTEND_PROXY_PATH}/`)) {
    return `/admin${pathname}`;
  }
  const rest = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${ADMIN_SCOPED_CLERK_PROXY_PATH}${rest}`;
}

/**
 * Keep handshake redirects inside the installed PWA (`scope: /admin`).
 * `/__clerk` and clerk.{apex} / accounts.dev are outside that scope, so iOS
 * opens Safari, sets the session there, and leaves the home-screen app blank.
 */
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
  if (url.host === incoming.host) {
    if (url.pathname === '/sign-in' || url.pathname.startsWith('/sign-in/')) {
      return `${incoming.origin}/admin/login${url.search}${url.hash}`;
    }
    if (
      url.pathname === DEFAULT_CLERK_FRONTEND_PROXY_PATH ||
      url.pathname.startsWith(`${DEFAULT_CLERK_FRONTEND_PROXY_PATH}/`)
    ) {
      return `${incoming.origin}${adminScopedClerkProxyPath(url.pathname)}${url.search}${url.hash}`;
    }
    return location;
  }
  if (!isClerkFrontendApiHost(url.hostname, extraFapiHosts)) return location;
  return `${incoming.origin}${adminScopedClerkProxyPath(url.pathname)}${url.search}${url.hash}`;
}

/** Rewrite Clerk middleware / proxy 3xx Location so the PWA never leaves `/admin`. */
export function rewriteClerkRedirectResponse(response: Response, request: Request): Response {
  if (response.status < 300 || response.status >= 400) return response;
  const location = response.headers.get('location');
  if (!location) return response;
  const extra = clerkFrontendApiHost() ? [clerkFrontendApiHost() as string] : [];
  const next = rewriteClerkProxyLocation(location, request.url, extra);
  if (next === location) return response;
  const headers = new Headers(response.headers);
  headers.set('location', next);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Drop Domain= so `__client` is stored on the app host, not clerk.{apex}. */
export function rewriteClerkProxySetCookie(cookie: string): string {
  return cookie.replace(/;\s*Domain=[^;]*/gi, '');
}

/** Fetch Clerk FAPI without throwing — instance hosts often fail TLS (alert 40). */
export async function fetchClerkUpstream(url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const cause = err instanceof Error && 'cause' in err ? (err as Error & { cause?: unknown }).cause : undefined;
    console.warn('[clerk-proxy] fetch failed', url, err, cause);
    return null;
  }
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
  const rest = incoming.pathname.replace(/^\/admin/, '').replace(/^\/__clerk\/?/, '');
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

  let upstream: Response | null = null;
  if (clerkSecretKey()) {
    upstream = await fetchClerkUpstream(officialTarget, init);
    if (upstream && (await isOfficialProxyRejected(upstream)) && instanceTarget) {
      const fallback = await fetchClerkUpstream(instanceTarget, init);
      if (fallback) upstream = fallback;
    }
  } else if (instanceTarget) {
    upstream = await fetchClerkUpstream(instanceTarget, init);
  } else {
    return new Response('Clerk is not configured', { status: 503 });
  }

  if (!upstream) {
    return new Response('Clerk Frontend API unreachable', { status: 502 });
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
  return (
    pathname === DEFAULT_CLERK_FRONTEND_PROXY_PATH ||
    pathname.startsWith(`${DEFAULT_CLERK_FRONTEND_PROXY_PATH}/`) ||
    pathname === ADMIN_SCOPED_CLERK_PROXY_PATH ||
    pathname.startsWith(`${ADMIN_SCOPED_CLERK_PROXY_PATH}/`)
  );
}
