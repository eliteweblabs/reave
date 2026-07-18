/**
 * GET /api/admin/social/callback/[platform]
 *
 * OAuth redirect target. Verifies the CSRF state cookie, exchanges the
 * authorization code for an access token, persists it, and sends the user
 * back to the admin Socials page with a success/error flag.
 */
import type { APIContext } from 'astro';
import { requestOrigin } from '../../../../../lib/requestOrigin.ts';
import {
  callbackUrl,
  exchangeCodeForToken,
  getOAuthConfig,
  getOAuthCredentials,
  isSocialPlatform,
} from '../../../../../lib/social/oauth.ts';
import { setSocialToken } from '../../../../../lib/social/tokenStore.ts';
import { OAUTH_STATE_COOKIE } from '../connect/[platform].ts';

export const prerender = false;

function adminRedirect(context: APIContext, params: Record<string, string>): Response {
  const url = new URL('/admin/', requestOrigin(context.request));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  context.cookies.delete(OAUTH_STATE_COOKIE, { path: '/' });
  return context.redirect(url.toString(), 302);
}

export async function GET(context: APIContext): Promise<Response> {
  const { userId } = context.locals.auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const platform = context.params.platform?.trim() ?? '';
  if (!isSocialPlatform(platform)) {
    return adminRedirect(context, { social_error: 'unknown_platform' });
  }

  const url = new URL(context.request.url);
  const error = url.searchParams.get('error');
  if (error) {
    return adminRedirect(context, { social_error: 'denied', platform });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return adminRedirect(context, { social_error: 'missing_code', platform });
  }

  // Verify CSRF state against the cookie set at connect time.
  const cookieRaw = context.cookies.get(OAUTH_STATE_COOKIE)?.value;
  let saved: { platform?: string; state?: string; verifier?: string | null } = {};
  try {
    saved = cookieRaw ? JSON.parse(cookieRaw) : {};
  } catch {
    saved = {};
  }
  if (!saved.state || saved.state !== state || saved.platform !== platform) {
    return adminRedirect(context, { social_error: 'state_mismatch', platform });
  }

  const cfg = getOAuthConfig(platform);
  const creds = getOAuthCredentials(cfg);
  if (!creds) {
    return adminRedirect(context, { social_error: 'not_configured', platform });
  }

  try {
    const token = await exchangeCodeForToken({
      cfg,
      creds,
      code,
      redirectUri: callbackUrl(requestOrigin(context.request), platform),
      codeVerifier: saved.verifier ?? undefined,
    });
    await setSocialToken({
      platform,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scope: token.scope,
      expiresAt: token.expiresAt ? new Date(token.expiresAt).toISOString() : null,
    });
    return adminRedirect(context, { social_connected: platform });
  } catch (e) {
    console.error(`[social-oauth] ${platform} token exchange failed`, e);
    return adminRedirect(context, { social_error: 'exchange_failed', platform });
  }
}
