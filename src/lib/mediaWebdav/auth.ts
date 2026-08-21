import { cachedCompanyBrandName } from '../companyConfig';
import { siteBaseUrl } from '../requestOrigin';
import { serverEnv } from '../serverEnv';
import {
  basicAuthMatches,
  parseBasicAuth,
  parseBearerToken,
  tokenAuthMatches,
  type BasicCredentials,
} from '../basicAuth';

export const MEDIA_WEBDAV_PREFIX = '/webdav';

export type MediaWebdavAuth = {
  username: string;
  method: 'basic' | 'token';
  source: 'media' | 'carddav';
};

export type MediaDropFolderInfo = {
  configured: boolean;
  url: string;
  host: string;
  path: string;
  username: string | null;
  authSource: 'media' | 'carddav' | null;
};

function mediaCredentials(): BasicCredentials | null {
  const username = serverEnv('MEDIA_WEBDAV_USERNAME')?.trim();
  const password = serverEnv('MEDIA_WEBDAV_PASSWORD')?.trim();
  const token = serverEnv('MEDIA_WEBDAV_TOKEN')?.trim() ?? null;
  if (username && password) return { username, password, token };
  if (token) return { username: username || 'media', password: token, token };
  return null;
}

function cardDavFallbackCredentials(): BasicCredentials | null {
  const username = serverEnv('CARDDAV_USERNAME')?.trim();
  const password = serverEnv('CARDDAV_PASSWORD')?.trim();
  const token = serverEnv('CARDDAV_TOKEN')?.trim() ?? serverEnv('CONTACT_API_KEY')?.trim() ?? null;
  if (username && password) return { username, password, token };
  if (token) return { username: username || 'carddav', password: token, token };
  return null;
}

function configuredCredentials(): (BasicCredentials & { source: 'media' | 'carddav' }) | null {
  const media = mediaCredentials();
  if (media) return { ...media, source: 'media' };
  const carddav = cardDavFallbackCredentials();
  if (carddav) return { ...carddav, source: 'carddav' };
  return null;
}

export function isMediaWebdavConfigured(): boolean {
  return configuredCredentials() !== null;
}

export function mediaDropFolderInfo(request?: Request): MediaDropFolderInfo {
  const creds = configuredCredentials();
  const origin = siteBaseUrl(request).replace(/\/+$/, '');
  const host = origin.replace(/^https?:\/\//, '').split('/')[0] || '';
  return {
    configured: !!creds,
    url: `${origin}${MEDIA_WEBDAV_PREFIX}`,
    host,
    path: MEDIA_WEBDAV_PREFIX,
    username: creds?.username ?? null,
    authSource: creds?.source ?? null,
  };
}

export function davDiscoveryHeaders(): Record<string, string> {
  return {
    DAV: '1, 2',
    Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, LOCK, UNLOCK',
    'MS-Author-Via': 'DAV',
    'Cache-Control': 'no-store',
  };
}

/** Returns null when auth succeeds; otherwise a 401/503 Response. */
export function requireMediaWebdavAuth(request: Request): MediaWebdavAuth | Response {
  const creds = configuredCredentials();
  if (!creds) {
    return new Response('Media drop folder is not configured', {
      status: 503,
      headers: { 'Content-Type': 'text/plain', ...davDiscoveryHeaders() },
    });
  }

  const authHeader = request.headers.get('Authorization') ?? '';
  const tokenHeader =
    request.headers.get('X-Media-WebDAV-Token')?.trim() ||
    request.headers.get('X-API-Key')?.trim() ||
    '';

  if (authHeader) {
    const basic = parseBasicAuth(authHeader);
    if (basic && basicAuthMatches(basic, creds)) {
      return { username: creds.username, method: 'basic', source: creds.source };
    }

    const bearerToken = parseBearerToken(authHeader);
    if (bearerToken && tokenAuthMatches(bearerToken, creds)) {
      return { username: creds.username, method: 'token', source: creds.source };
    }
  }

  if (tokenHeader && tokenAuthMatches(tokenHeader, creds)) {
    return { username: creds.username, method: 'token', source: creds.source };
  }

  const realmName = serverEnv('COMPANY_NAME')?.trim() || cachedCompanyBrandName();

  return new Response('Unauthorized', {
    status: 401,
    headers: {
      'Content-Type': 'text/plain',
      'WWW-Authenticate': `Basic realm="${realmName} Media"`,
      ...davDiscoveryHeaders(),
    },
  });
}
