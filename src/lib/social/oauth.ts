/**
 * OAuth 2.0 "Connect account" flow for social platforms.
 *
 * Each platform registers an OAuth app (developer portal) and provides a
 * client id + secret via env vars. Instagram uses Business Login
 * (`INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`). Once set, the Socials page
 * shows a "Connect" link → the platform's consent screen → back to our
 * callback, which exchanges the code for an access token (stored via tokenStore).
 *
 * Nothing here needs to be exercised until real credentials exist; when a
 * platform's client id/secret env vars are unset it reports "not configured"
 * and the UI shows setup instructions instead of a Connect button.
 */
import { createHash, randomBytes } from 'node:crypto';
import { serverEnv } from '../serverEnv.ts';
import type { SocialPlatformId } from './types.ts';

export interface OAuthPlatformConfig {
  platform: SocialPlatformId;
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
  /** Separator between scopes in the authorize URL (space or comma). */
  scopeSeparator: string;
  /** Most providers use `client_id`; TikTok uses `client_key`. */
  clientIdParam: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** PKCE (code_challenge) — required by X, optional elsewhere. */
  usePkce: boolean;
  /** How client credentials are sent to the token endpoint. */
  tokenAuth: 'basic' | 'body';
  /** Extra params appended to the authorize URL (e.g. access_type=offline). */
  extraAuthParams?: Record<string, string>;
  /** Where to create the OAuth app. */
  developerPortal: string;
  /** Short human hint about what to register. */
  setupHint: string;
}

/**
 * Platform OAuth definitions. Endpoints/scopes reflect each provider's current
 * OAuth 2.0 docs; some (Meta, TikTok) have review requirements before scopes
 * beyond basic profile are granted.
 */
export const OAUTH_CONFIGS: Partial<Record<SocialPlatformId, OAuthPlatformConfig>> = {
  twitter: {
    platform: 'twitter',
    label: 'X / Twitter',
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scopes: ['tweet.read', 'users.read', 'follows.read', 'offline.access'],
    scopeSeparator: ' ',
    clientIdParam: 'client_id',
    clientIdEnv: 'X_CLIENT_ID',
    clientSecretEnv: 'X_CLIENT_SECRET',
    usePkce: true,
    tokenAuth: 'basic',
    developerPortal: 'https://developer.x.com/en/portal/dashboard',
    setupHint: 'Create an OAuth 2.0 app (X developer portal) and add the callback URL below.',
  },
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    authorizeUrl: 'https://www.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scopes: ['instagram_business_basic', 'instagram_business_manage_comments'],
    scopeSeparator: ',',
    clientIdParam: 'client_id',
    clientIdEnv: 'INSTAGRAM_APP_ID',
    clientSecretEnv: 'INSTAGRAM_APP_SECRET',
    usePkce: false,
    tokenAuth: 'body',
    developerPortal: 'https://developers.facebook.com/apps/',
    setupHint:
      'Create a Meta app with Instagram → API setup with Instagram login (not Facebook Login). Use the Instagram App ID / Secret from Business login settings — they are not the Meta App ID at the top of the dashboard. The Instagram account must be Professional (Business or Creator).',
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    authorizeUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scopes: ['pages_show_list', 'read_insights', 'pages_read_engagement'],
    scopeSeparator: ',',
    clientIdParam: 'client_id',
    clientIdEnv: 'META_APP_ID',
    clientSecretEnv: 'META_APP_SECRET',
    usePkce: false,
    tokenAuth: 'body',
    developerPortal: 'https://www.facebook.com/login.php?next=https%3A%2F%2Fdevelopers.facebook.com%2Fapps%2Fcreation%2F',
    setupHint: 'Log into Facebook first — Meta’s apps list often opens a blank Business login page if you are not already signed in. Create a Meta app with Facebook Login, then paste the callback URL.',
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scopes: ['r_organization_social', 'rw_organization_admin'],
    scopeSeparator: ' ',
    clientIdParam: 'client_id',
    clientIdEnv: 'LINKEDIN_CLIENT_ID',
    clientSecretEnv: 'LINKEDIN_CLIENT_SECRET',
    usePkce: false,
    tokenAuth: 'body',
    developerPortal: 'https://www.linkedin.com/developers/apps',
    setupHint: 'Create a LinkedIn app, request Marketing/Community Management API, add the callback URL.',
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
    scopeSeparator: ' ',
    clientIdParam: 'client_id',
    clientIdEnv: 'GOOGLE_CLIENT_ID',
    clientSecretEnv: 'GOOGLE_CLIENT_SECRET',
    usePkce: false,
    tokenAuth: 'body',
    extraAuthParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    developerPortal: 'https://console.cloud.google.com/apis/credentials',
    setupHint: 'Create an OAuth client (Google Cloud), enable the YouTube Data API, add the callback URL.',
  },
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scopes: ['user.info.basic', 'user.info.stats'],
    scopeSeparator: ',',
    clientIdParam: 'client_key',
    clientIdEnv: 'TIKTOK_CLIENT_KEY',
    clientSecretEnv: 'TIKTOK_CLIENT_SECRET',
    usePkce: true,
    tokenAuth: 'body',
    developerPortal: 'https://developers.tiktok.com/apps',
    setupHint: 'Create a TikTok app, add Login Kit + the callback URL below.',
  },
};

export function isSocialPlatform(value: string): value is SocialPlatformId {
  return Object.prototype.hasOwnProperty.call(OAUTH_CONFIGS, value);
}

export function getOAuthConfig(platform: SocialPlatformId): OAuthPlatformConfig {
  const cfg = OAUTH_CONFIGS[platform];
  if (!cfg) throw new Error(`OAuth is not available for platform: ${platform}`);
  return cfg;
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Client id/secret from env, or null when the platform isn't set up. */
export function getOAuthCredentials(cfg: OAuthPlatformConfig): OAuthCredentials | null {
  const clientId = serverEnv(cfg.clientIdEnv)?.trim();
  const clientSecret = serverEnv(cfg.clientSecretEnv)?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isPlatformConfigured(platform: SocialPlatformId): boolean {
  return getOAuthCredentials(getOAuthConfig(platform)) != null;
}

/** Redirect URI registered with the provider (absolute, per platform). */
export function callbackUrl(origin: string, platform: SocialPlatformId): string {
  return `${origin.replace(/\/+$/, '')}/api/admin/social/callback/${platform}`;
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(): PkcePair {
  const verifier = randomToken(32);
  const challenge = base64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

export interface BuildAuthorizeUrlArgs {
  cfg: OAuthPlatformConfig;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge?: string;
}

export function buildAuthorizeUrl(args: BuildAuthorizeUrlArgs): string {
  const { cfg, clientId, redirectUri, state, codeChallenge } = args;
  const url = new URL(cfg.authorizeUrl);
  const params = url.searchParams;
  params.set(cfg.clientIdParam, clientId);
  params.set('redirect_uri', redirectUri);
  params.set('response_type', 'code');
  params.set('scope', cfg.scopes.join(cfg.scopeSeparator));
  params.set('state', state);
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) params.set(k, v);
  if (cfg.usePkce && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }
  return url.toString();
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
  /** Unix ms when the access token expires, if known. */
  expiresAt: number | null;
  tokenType: string | null;
}

interface ExchangeArgs {
  cfg: OAuthPlatformConfig;
  creds: OAuthCredentials;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
}

function parseTokenBody(text: string, contentType: string): Record<string, unknown> {
  if (contentType.includes('application/json') || text.trim().startsWith('{')) {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* fall through */
    }
  }
  // Legacy form-encoded (older Facebook responses).
  const out: Record<string, unknown> = {};
  for (const [k, v] of new URLSearchParams(text)) out[k] = v;
  return out;
}

/** Instagram sometimes appends `#_` to the authorization code. */
export function normalizeOAuthCode(code: string): string {
  return code.trim().replace(/#_+/, '').replace(/#$/, '');
}

function firstRecord(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
    return value[0] as Record<string, unknown>;
  }
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return null;
}

/** Instagram Login nests the token under `data[0]`; other providers are flat. */
export function tokenFieldsFromBody(data: Record<string, unknown>): Record<string, unknown> {
  const nested = firstRecord(data.data);
  if (nested && (nested.access_token || nested.accessToken)) return { ...data, ...nested };
  return data;
}

function tokenResponseFromFields(data: Record<string, unknown>): TokenResponse {
  const fields = tokenFieldsFromBody(data);
  const accessToken = String(fields.access_token ?? fields.accessToken ?? '');
  if (!accessToken) {
    throw new Error(`No access_token in response: ${JSON.stringify(data).slice(0, 200)}`);
  }
  const expiresIn = Number(fields.expires_in);
  const scope =
    typeof fields.scope === 'string'
      ? fields.scope
      : typeof fields.permissions === 'string'
        ? fields.permissions
        : null;
  return {
    accessToken,
    refreshToken: typeof fields.refresh_token === 'string' ? fields.refresh_token : null,
    scope,
    expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? Date.now() + expiresIn * 1000 : null,
    tokenType: typeof fields.token_type === 'string' ? fields.token_type : null,
  };
}

/** Short-lived Instagram tokens last ~1 hour; swap for a 60-day token. */
export async function exchangeInstagramLongLived(
  shortLivedToken: string,
  clientSecret: string,
): Promise<TokenResponse | null> {
  const url = new URL('https://graph.instagram.com/access_token');
  url.searchParams.set('grant_type', 'ig_exchange_token');
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('access_token', shortLivedToken);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    console.warn('[social-oauth] Instagram long-lived exchange failed', res.status, text.slice(0, 200));
    return null;
  }
  try {
    return tokenResponseFromFields(parseTokenBody(text, res.headers.get('content-type') || ''));
  } catch (e) {
    console.warn('[social-oauth] Instagram long-lived parse failed', e);
    return null;
  }
}

export async function fetchInstagramAccountLabel(accessToken: string): Promise<string | null> {
  try {
    const url = new URL('https://graph.instagram.com/me');
    url.searchParams.set('fields', 'username,name,account_type');
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string; name?: string };
    const username = typeof data.username === 'string' ? data.username.trim() : '';
    if (username) return `@${username.replace(/^@/, '')}`;
    const name = typeof data.name === 'string' ? data.name.trim() : '';
    return name || null;
  } catch {
    return null;
  }
}

/** Exchange an authorization code for an access token. */
export async function exchangeCodeForToken(args: ExchangeArgs): Promise<TokenResponse> {
  const { cfg, creds, redirectUri, codeVerifier } = args;
  const code = normalizeOAuthCode(args.code);

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set(cfg.clientIdParam, creds.clientId);
  if (cfg.usePkce && codeVerifier) body.set('code_verifier', codeVerifier);

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  if (cfg.tokenAuth === 'basic') {
    const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
  } else {
    body.set('client_secret', creds.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, { method: 'POST', headers, body });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let token = tokenResponseFromFields(parseTokenBody(text, res.headers.get('content-type') || ''));
  if (cfg.platform === 'instagram') {
    const longLived = await exchangeInstagramLongLived(token.accessToken, creds.clientSecret);
    if (longLived) token = longLived;
  }
  return token;
}
