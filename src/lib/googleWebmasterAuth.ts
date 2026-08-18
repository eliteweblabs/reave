/**
 * Google OAuth for Search Console + GA4 + Site Verification + Workspace DKIM (agency or per-contact).
 *
 * Reuses GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (same Cloud project as YouTube).
 * Tokens live in integration_tokens under provider `google_webmaster`.
 */
import {
  agencySubject,
  contactSubject,
  getIntegrationToken,
  setIntegrationToken,
  type IntegrationSubject,
} from './integrationTokens';
import { serverEnv } from './serverEnv.ts';

export const GOOGLE_WEBMASTER_PROVIDER = 'google_webmaster' as const;

export const GOOGLE_WEBMASTER_SCOPES = [
  'https://www.googleapis.com/auth/webmasters',
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/siteverification',
  // Google Workspace DKIM management (Gmail Admin API)
  'https://www.googleapis.com/auth/admin.directory.domain',
  'openid',
  'email',
] as const;

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function isGoogleWebmasterOAuthConfigured(): boolean {
  return Boolean(
    serverEnv('GOOGLE_CLIENT_ID')?.trim() && serverEnv('GOOGLE_CLIENT_SECRET')?.trim(),
  );
}

export function googleWebmasterCallbackUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/admin/analytic-audit/callback`;
}

export function resolveGoogleSubject(contactUid?: string | null): IntegrationSubject {
  const uid = (contactUid ?? '').trim();
  return uid ? contactSubject(uid) : agencySubject();
}

export function buildGoogleWebmasterAuthorizeUrl(args: {
  redirectUri: string;
  state: string;
}): string {
  const clientId = serverEnv('GOOGLE_CLIENT_ID')?.trim();
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', args.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_WEBMASTER_SCOPES.join(' '));
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

export async function exchangeGoogleWebmasterCode(args: {
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
  // Refresh responses usually omit refresh_token — keep the old one.
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

/** Persist tokens after OAuth callback. */
export async function storeGoogleWebmasterTokens(args: {
  subject: IntegrationSubject;
  tokens: GoogleTokenExchangeResult;
}): Promise<boolean> {
  const accountLabel = await fetchGoogleAccountEmail(args.tokens.accessToken);
  return setIntegrationToken({
    subject: args.subject,
    provider: GOOGLE_WEBMASTER_PROVIDER,
    accessToken: args.tokens.accessToken,
    refreshToken: args.tokens.refreshToken,
    scope: args.tokens.scope,
    expiresAt: args.tokens.expiresAt
      ? new Date(args.tokens.expiresAt).toISOString()
      : null,
    accountLabel,
  });
}

const REFRESH_SKEW_MS = 60_000;

/**
 * Return a valid access token for the subject, refreshing when needed.
 * Throws with a clear ANALYTICS_AUTH message when disconnected / refresh fails.
 */
export async function getGoogleWebmasterAccessToken(
  subject: IntegrationSubject = agencySubject(),
): Promise<string> {
  const stored = await getIntegrationToken(subject, GOOGLE_WEBMASTER_PROVIDER);
  if (!stored?.accessToken) {
    throw new AnalyticsAuthError(
      'Google Search Console / Analytics is not connected. Connect it in Admin → Analytics.',
    );
  }

  const expiresAtMs = stored.expiresAt ? new Date(stored.expiresAt).getTime() : null;
  const stillFresh =
    !expiresAtMs || expiresAtMs - Date.now() > REFRESH_SKEW_MS;

  if (stillFresh) return stored.accessToken;

  if (!stored.refreshToken) {
    throw new AnalyticsAuthError(
      'Google access token expired and no refresh token is stored. Reconnect Google in Admin → Analytics.',
    );
  }

  try {
    const refreshed = await refreshGoogleAccessToken(stored.refreshToken);
    await setIntegrationToken({
      subject,
      provider: GOOGLE_WEBMASTER_PROVIDER,
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new AnalyticsAuthError(`Google token refresh failed: ${msg}`);
  }
}

export class AnalyticsAuthError extends Error {
  readonly code = 'ANALYTICS_AUTH' as const;
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'AnalyticsAuthError';
  }
}

export class AnalyticsApiError extends Error {
  readonly code = 'ANALYTICS_FAILED' as const;
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'AnalyticsApiError';
    this.status = status;
  }
}

/** Structured failure payload for agent tools — do not invent metrics. */
export function analyticsFailedPayload(
  reason: string,
  extras: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    ok: false,
    error: 'ANALYTICS_FAILED',
    reason,
    instruction:
      'Mark the Search / Analytics section in the audit markdown as **Failed** with this reason. ' +
      'Do NOT invent metrics, scores, or traffic numbers. Do NOT retry this tool. Continue other audit sections.',
    ...extras,
  });
}
