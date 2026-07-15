import { cachedCompanyBrandName } from '../companyConfig';
import { serverEnv } from '../serverEnv';

export type CardDavAuth = {
  username: string;
  method: 'basic' | 'token';
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function parseBasicAuth(header: string): { username: string; password: string } | null {
  const m = /^Basic\s+(.+)$/i.exec(header.trim());
  if (!m) return null;
  try {
    const decoded = atob(m[1].trim());
    const sep = decoded.indexOf(':');
    if (sep < 0) return null;
    return { username: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
  } catch {
    return null;
  }
}

function configuredCredentials(): { username: string; password: string; token: string | null } | null {
  const username = serverEnv('CARDDAV_USERNAME')?.trim();
  const password = serverEnv('CARDDAV_PASSWORD')?.trim();
  const token = serverEnv('CARDDAV_TOKEN')?.trim() ?? serverEnv('CONTACT_API_KEY')?.trim() ?? null;

  if (username && password) return { username, password, token };
  if (token) return { username: username || 'carddav', password: token, token };
  return null;
}

export function isCardDavConfigured(): boolean {
  return configuredCredentials() !== null;
}

/** Returns null when auth succeeds; otherwise a 401 Response. */
export function requireCardDavAuth(request: Request): CardDavAuth | Response {
  const creds = configuredCredentials();
  if (!creds) {
    return new Response('CardDAV is not configured', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const tokenHeader =
    request.headers.get('X-CardDAV-Token')?.trim() ||
    request.headers.get('X-API-Key')?.trim() ||
    '';

  if (authHeader) {
    const basic = parseBasicAuth(authHeader);
    if (basic) {
      const userOk = timingSafeEqual(basic.username, creds.username);
      const passOk = timingSafeEqual(basic.password, creds.password);
      if (userOk && passOk) return { username: creds.username, method: 'basic' };
    }

    const bearer = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (bearer && creds.token && timingSafeEqual(bearer[1].trim(), creds.token)) {
      return { username: creds.username, method: 'token' };
    }
  }

  if (tokenHeader && creds.token && timingSafeEqual(tokenHeader, creds.token)) {
    return { username: creds.username, method: 'token' };
  }

  const realmName = serverEnv('COMPANY_NAME')?.trim() || cachedCompanyBrandName();

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': `Basic realm="${realmName} CardDAV"`,
    },
  });
}
