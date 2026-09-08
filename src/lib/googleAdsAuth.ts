/**
 * Google OAuth for Google Ads API.
 *
 * Reuses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Tokens live in
 * integration_tokens under provider `google_ads`.
 */
import {
  agencySubject,
  contactSubject,
  getIntegrationToken,
  setIntegrationToken,
  toIntegrationStatus,
  type IntegrationSubject,
} from './integrationTokens';
import { serverEnv } from './serverEnv.ts';

export const GOOGLE_ADS_PROVIDER = 'google_ads' as const;

export const GOOGLE_ADS_SCOPES = [
  'https://www.googleapis.com/auth/adwords',
  'openid',
  'email',
] as const;

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function isGoogleAdsOAuthConfigured(): boolean {
  return Boolean(
    serverEnv('GOOGLE_CLIENT_ID')?.trim() && serverEnv('GOOGLE_CLIENT_SECRET')?.trim(),
  );
}

export function isGoogleAdsDeveloperTokenConfigured(): boolean {
  return Boolean(serverEnv('GOOGLE_ADS_DEVELOPER_TOKEN')?.trim());
}

export function googleAdsCallbackUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/admin/google-ads/callback`;
}

export function resolveGoogleAdsSubject(contactUid?: string | null): IntegrationSubject {
  const uid = (contactUid ?? '').trim();
  return uid ? contactSubject(uid) : agencySubject();
}

export function buildGoogleAdsAuthorizeUrl(args: {
  redirectUri: string;
  state: string;
}): string {
  const clientId = serverEnv('GOOGLE_CLIENT_ID')?.trim();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_ADS_SCOPES.join(' '));
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

export async function exchangeGoogleAdsCode(args: {
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

export async function storeGoogleAdsTokens(args: {
  subject: IntegrationSubject;
  tokens: GoogleTokenExchangeResult;
  meta?: Record<string, unknown> | null;
}): Promise<boolean> {
  const accountLabel = await fetchGoogleAccountEmail(args.tokens.accessToken);
  return setIntegrationToken({
    subject: args.subject,
    provider: GOOGLE_ADS_PROVIDER,
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

export class GoogleAdsAuthError extends Error {
  readonly code = 'GOOGLE_ADS_AUTH' as const;
  constructor(message: string) {
    super(message);
    this.name = 'GoogleAdsAuthError';
  }
}

export async function getGoogleAdsRefreshToken(
  subject: IntegrationSubject = agencySubject(),
): Promise<string> {
  const stored = await getIntegrationToken(subject, GOOGLE_ADS_PROVIDER);
  const refresh = stored?.refreshToken?.trim();
  if (refresh) return refresh;

  if (stored?.accessToken) {
    throw new GoogleAdsAuthError(
      'Google Ads is connected but no refresh token is stored. Reconnect via GET /api/admin/google-ads/connect with prompt=consent.',
    );
  }

  throw new GoogleAdsAuthError(
    'Google Ads is not connected. Connect via GET /api/admin/google-ads/connect (admin session required).',
  );
}

export async function getGoogleAdsConnectionStatus(subject: IntegrationSubject = agencySubject()) {
  const token = await getIntegrationToken(subject, GOOGLE_ADS_PROVIDER);
  return toIntegrationStatus(token, subject, GOOGLE_ADS_PROVIDER);
}

export async function appendGoogleAdsAuditEntry(
  subject: IntegrationSubject,
  entry: Record<string, unknown>,
): Promise<void> {
  const stored = await getIntegrationToken(subject, GOOGLE_ADS_PROVIDER);
  if (!stored) return;
  const prior = Array.isArray(stored.meta?.auditLog)
    ? (stored.meta!.auditLog as Record<string, unknown>[])
    : [];
  const auditLog = [{ at: new Date().toISOString(), ...entry }, ...prior].slice(0, 50);
  await setIntegrationToken({
    subject,
    provider: GOOGLE_ADS_PROVIDER,
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    scope: stored.scope,
    expiresAt: stored.expiresAt,
    accountLabel: stored.accountLabel,
    meta: { ...(stored.meta ?? {}), auditLog },
  });
}

/** Structured failure payload for agent tools. */
export function googleAdsFailedPayload(
  reason: string,
  extras: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    ok: false,
    error: 'GOOGLE_ADS_FAILED',
    reason,
    ...extras,
  });
}
