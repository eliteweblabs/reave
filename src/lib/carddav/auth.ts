import { cachedCompanyBrandName } from '../companyConfig';
import { serverEnv } from '../serverEnv';
import {
  basicAuthMatches,
  parseBasicAuth,
  parseBearerToken,
  tokenAuthMatches,
  type BasicCredentials,
} from '../basicAuth';

export type CardDavAuth = {
  username: string;
  method: 'basic' | 'token';
};

function parseBasicAuthHeader(header: string): { username: string; password: string } | null {
  return parseBasicAuth(header);
}

function configuredCredentials(): BasicCredentials | null {
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
    const basic = parseBasicAuthHeader(authHeader);
    if (basic && basicAuthMatches(basic, creds)) {
      return { username: creds.username, method: 'basic' };
    }

    const bearerToken = parseBearerToken(authHeader);
    if (bearerToken && tokenAuthMatches(bearerToken, creds)) {
      return { username: creds.username, method: 'token' };
    }
  }

  if (tokenHeader && tokenAuthMatches(tokenHeader, creds)) {
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
