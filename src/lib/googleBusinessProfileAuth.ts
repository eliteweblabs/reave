/**
 * Google OAuth for Business Profile (GBP) management.
 *
 * Reuses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Tokens live in
 * integration_tokens under provider `google_business_profile`.
 */
import {
  agencySubject,
  getIntegrationToken,
  setIntegrationToken,
  toIntegrationStatus,
  type IntegrationSubject,
} from './integrationTokens';
import { serverEnv } from './serverEnv.ts';

export const GOOGLE_BUSINESS_PROFILE_PROVIDER = 'google_business_profile' as const;

export const GOOGLE_BUSINESS_PROFILE_SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'openid',
  'email',
] as const;

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function isGoogleBusinessProfileOAuthConfigured(): boolean {
  return Boolean(
    serverEnv('GOOGLE_CLIENT_ID')?.trim() && serverEnv('GOOGLE_CLIENT_SECRET')?.trim(),
  );
}

export function googleBusinessProfileCallbackUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/admin/google-business/callback`;
}

export function buildGoogleBusinessProfileAuthorizeUrl(args: {
  redirectUri: string;
  state: string;
}): string {
  const clientId = serverEnv('GOOGLE_CLIENT_ID')?.trim();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_BUSINESS_PROFILE_SCOPES.join(' '));
  url.searchParams.set('state', args.state);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('include_granted_scopes', 'true');
  return url.toString();
}

export interface GoogleTokenExchangeResult {
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  expiresAt: number | null;
}

async function parseGoogleTokenResponse(res: Response): Promise<GoogleTokenExchangeResult> {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`Google token response was not JSON: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const err =
      typeof data.error_description === 'string'
        ? data.error_description
        : typeof data.error === 'string'
          ? data.error
          : text.slice(0, 300);
    throw new Error(`Google token error (${res.status}): ${err}`);
  }
  const accessToken = String(data.access_token ?? '');
  if (!accessToken) throw new Error('No access_token in Google response');
  const expiresIn = Number(data.expires_in);
  return {
    accessToken,
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : null,
    scope: typeof data.scope === 'string' ? data.scope : null,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
  };
}

export async function exchangeGoogleBusinessProfileCode(args: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokenExchangeResult> {
  const clientId = serverEnv('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = serverEnv('GOOGLE_CLIENT_SECRET')?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  return parseGoogleTokenResponse(res);
}

async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenExchangeResult> {
  const clientId = serverEnv('GOOGLE_CLIENT_ID')?.trim();
  const clientSecret = serverEnv('GOOGLE_CLIENT_SECRET')?.trim();
  if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const result = await parseGoogleTokenResponse(res);
  if (!result.refreshToken) result.refreshToken = refreshToken;
  return result;
}

async function fetchGoogleAccountEmail(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: string };
    return typeof data.email === 'string' ? data.email : null;
  } catch {
    return null;
  }
}

export async function storeGoogleBusinessProfileTokens(args: {
  subject: IntegrationSubject;
  tokens: GoogleTokenExchangeResult;
  meta?: Record<string, unknown> | null;
}): Promise<boolean> {
  const accountLabel = await fetchGoogleAccountEmail(args.tokens.accessToken);
  return setIntegrationToken({
    subject: args.subject,
    provider: GOOGLE_BUSINESS_PROFILE_PROVIDER,
    accessToken: args.tokens.accessToken,
    refreshToken: args.tokens.refreshToken,
    scope: args.tokens.scope,
    expiresAt: args.tokens.expiresAt
      ? new Date(args.tokens.expiresAt).toISOString()
      : null,
    accountLabel,
    meta: args.meta ?? null,
  });
}

const REFRESH_SKEW_MS = 60_000;

export class GoogleBusinessProfileAuthError extends Error {
  readonly code = 'GBP_AUTH' as const;
  constructor(message: string) {
    super(message);
    this.name = 'GoogleBusinessProfileAuthError';
  }
}

export async function getGoogleBusinessProfileAccessToken(
  subject: IntegrationSubject = agencySubject(),
): Promise<string> {
  const stored = await getIntegrationToken(subject, GOOGLE_BUSINESS_PROFILE_PROVIDER);
  if (!stored?.accessToken) {
    throw new GoogleBusinessProfileAuthError(
      'Google Business Profile is not connected. Connect it in Admin → Company → Hours.',
    );
  }

  const expiresAtMs = stored.expiresAt ? new Date(stored.expiresAt).getTime() : null;
  const stillFresh = !expiresAtMs || expiresAtMs - Date.now() > REFRESH_SKEW_MS;
  if (stillFresh) return stored.accessToken;

  if (!stored.refreshToken) {
    throw new GoogleBusinessProfileAuthError(
      'Google Business Profile token expired. Reconnect in Admin → Company → Hours.',
    );
  }

  const refreshed = await refreshGoogleAccessToken(stored.refreshToken);
  await setIntegrationToken({
    subject,
    provider: GOOGLE_BUSINESS_PROFILE_PROVIDER,
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken ?? stored.refreshToken,
    scope: refreshed.scope ?? stored.scope,
    expiresAt: refreshed.expiresAt
      ? new Date(refreshed.expiresAt).toISOString()
      : null,
    accountLabel: stored.accountLabel,
    meta: stored.meta,
  });
  return refreshed.accessToken;
}

export async function getGoogleBusinessProfileConnectionStatus(
  subject: IntegrationSubject = agencySubject(),
) {
  const token = await getIntegrationToken(subject, GOOGLE_BUSINESS_PROFILE_PROVIDER);
  return toIntegrationStatus(token, subject, GOOGLE_BUSINESS_PROFILE_PROVIDER);
}

export async function updateGoogleBusinessProfileMeta(
  subject: IntegrationSubject,
  meta: Record<string, unknown>,
): Promise<boolean> {
  const stored = await getIntegrationToken(subject, GOOGLE_BUSINESS_PROFILE_PROVIDER);
  if (!stored) return false;
  return setIntegrationToken({
    subject,
    provider: GOOGLE_BUSINESS_PROFILE_PROVIDER,
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    scope: stored.scope,
    expiresAt: stored.expiresAt,
    accountLabel: stored.accountLabel,
    meta: { ...(stored.meta ?? {}), ...meta },
  });
}
