import { siteBaseUrl } from '../contactApi';

/** Public origin for CardDAV hrefs — never trust `request.url.origin` behind Railway/Cloudflare. */
export function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get('X-Forwarded-Host')?.split(',')[0]?.trim();
  const forwardedProto =
    request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim() || 'https';

  if (
    forwardedHost &&
    forwardedHost !== 'localhost' &&
    !forwardedHost.startsWith('127.') &&
    !forwardedHost.endsWith('.internal')
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const host = request.headers.get('Host')?.trim();
  if (host && host !== 'localhost' && !host.startsWith('127.') && !host.includes(':4321')) {
    const proto = forwardedProto || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  return siteBaseUrl();
}
