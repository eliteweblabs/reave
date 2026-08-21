import { secretMatches } from './secretCompare';

export type BasicCredentials = {
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

export function basicAuthMatches(
  basic: { username: string; password: string },
  creds: BasicCredentials,
): boolean {
  return secretMatches(basic.username, creds.username) && secretMatches(basic.password, creds.password);
}

export function tokenAuthMatches(token: string, creds: BasicCredentials): boolean {
  return Boolean(creds.token && secretMatches(token, creds.token));
}
