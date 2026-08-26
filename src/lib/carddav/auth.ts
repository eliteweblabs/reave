import { cachedCompanyBrandName } from '../companyConfig';
import { serverEnv } from '../serverEnv';
import { verifyDavAuth, type DavCredentials } from '../davAuthShared';

export type CardDavAuth = {
  username: string;
  method: 'basic' | 'token';
};

function configuredCredentials(): DavCredentials | null {
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

  const verified = verifyDavAuth({
    request,
    creds,
    tokenHeaderNames: ['X-CardDAV-Token', 'X-API-Key'],
  });
  if (verified.ok) return { username: verified.username, method: verified.method };

  const realmName = serverEnv('COMPANY_NAME')?.trim() || cachedCompanyBrandName();

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': `Basic realm="${realmName} CardDAV"`,
    },
  });
}
