import { secretMatches } from './secretCompare';

export type DavAuthMethod = 'basic' | 'token';

export type DavCredentials = {
  username: string;
  password: string;
  token: string | null;
};

export function parseBasicAuth(header: string): { username: string; password: string } | null {
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

export function parseBearerToken(header: string): string | null {
  const bearer = /^Bearer\s+(.+)$/i.exec(header.trim());
  return bearer ? bearer[1].trim() : null;
}

export type VerifyDavAuthInput = {
  request: Request;
  creds: DavCredentials;
  tokenHeaderNames?: string[];
};

export type VerifyDavAuthResult =
  | { ok: true; username: string; method: DavAuthMethod }
  | { ok: false };

/** Shared Basic/Bearer/header-token verification for CardDAV and WebDAV routes. */
export function verifyDavAuth(input: VerifyDavAuthInput): VerifyDavAuthResult {
  const authHeader = input.request.headers.get('Authorization') ?? '';
  const tokenHeaderNames = input.tokenHeaderNames ?? ['X-API-Key'];
  let tokenHeader = '';
  for (const name of tokenHeaderNames) {
    const value = input.request.headers.get(name)?.trim();
    if (value) {
      tokenHeader = value;
      break;
    }
  }

  if (authHeader) {
    const basic = parseBasicAuth(authHeader);
    if (basic) {
      const userOk = secretMatches(basic.username, input.creds.username);
      const passOk = secretMatches(basic.password, input.creds.password);
      if (userOk && passOk) return { ok: true, username: input.creds.username, method: 'basic' };
    }

    const bearer = parseBearerToken(authHeader);
    if (bearer && input.creds.token && secretMatches(bearer, input.creds.token)) {
      return { ok: true, username: input.creds.username, method: 'token' };
    }
  }

  if (tokenHeader && input.creds.token && secretMatches(tokenHeader, input.creds.token)) {
    return { ok: true, username: input.creds.username, method: 'token' };
  }

  return { ok: false };
}
