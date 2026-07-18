/**
 * GET /api/admin/social/connect/[platform]
 *
 * Kicks off the OAuth "Connect account" flow: stores a short-lived CSRF state
 * (and PKCE verifier) in an httpOnly cookie, then redirects the browser to the
 * platform's consent screen. Designed to be used as a plain link from the
 * Socials settings page.
 */
import type { APIContext } from 'astro';
import { requestOrigin } from '../../../../../lib/requestOrigin.ts';
import {
  buildAuthorizeUrl,
  callbackUrl,
  createPkcePair,
  getOAuthConfig,
  getOAuthCredentials,
  isSocialPlatform,
  randomToken,
} from '../../../../../lib/social/oauth.ts';

export const prerender = false;

export const OAUTH_STATE_COOKIE = 'social_oauth';

function adminRedirect(context: APIContext, params: Record<string, string>): Response {
  const url = new URL('/admin/', requestOrigin(context.request));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return context.redirect(url.toString(), 302);
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const platform = context.params.platform?.trim() ?? '';
  if (!isSocialPlatform(platform)) {
    return adminRedirect(context, { social_error: 'unknown_platform' });
  }

  const cfg = getOAuthConfig(platform);
  const creds = getOAuthCredentials(cfg);
  if (!creds) {
    return adminRedirect(context, { social_error: 'not_configured', platform });
  }

  const origin = requestOrigin(context.request);
  const redirectUri = callbackUrl(origin, platform);
  const state = randomToken(24);
  const pkce = cfg.usePkce ? createPkcePair() : null;

  // Bind state (and PKCE verifier) to this browser for the callback to verify.
  const cookieValue = JSON.stringify({
    platform,
    state,
    verifier: pkce?.verifier ?? null,
  });
  context.cookies.set(OAUTH_STATE_COOKIE, cookieValue, {
    httpOnly: true,
    secure: origin.startsWith('https://'),
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  const authorizeUrl = buildAuthorizeUrl({
    cfg,
    clientId: creds.clientId,
    redirectUri,
    state,
    codeChallenge: pkce?.challenge,
  });

  return context.redirect(authorizeUrl, 302);
}
