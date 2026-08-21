import { clerkFrontendApiOrigin } from './clerkClient';

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
 * Same-origin Clerk Frontend API proxy so client domains can sign in without a
 * per-host `clerk.*` CNAME.
 *
 * Forward to this instance's FAPI host (from the publishable key), not
 * `frontend-api.clerk.dev`. That shared host only accepts official proxy mode
 * (`Clerk-Proxy-Url` registered in the Dashboard) and otherwise returns
 * `host_invalid`.
 */
export async function proxyClerkFrontendApi(request: Request): Promise<Response> {
  const fapiOrigin = clerkFrontendApiOrigin();
  if (!fapiOrigin) {
    return new Response('Clerk is not configured', { status: 503 });
  }

  const incoming = new URL(request.url);
  const rest = incoming.pathname.replace(/^\/__clerk\/?/, '');
  const target = `${fapiOrigin}/${rest}${incoming.search}`;

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
