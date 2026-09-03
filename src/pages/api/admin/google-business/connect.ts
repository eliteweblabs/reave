/**
 * GET /api/admin/google-business/connect — start GBP OAuth (agency-wide).
 */
import type { APIContext } from 'astro';
import { randomBytes } from 'node:crypto';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { requestOrigin } from '../../../../lib/requestOrigin.ts';
import { agencySubject } from '../../../../lib/integrationTokens';
import {
  buildGoogleBusinessProfileAuthorizeUrl,
  googleBusinessProfileCallbackUrl,
  isGoogleBusinessProfileOAuthConfigured,
} from '../../../../lib/googleBusinessProfileAuth';

export const prerender = false;

export const GBP_OAUTH_COOKIE = 'gbp_oauth';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function adminRedirect(context: APIContext, params: Record<string, string>): Response {
  const url = new URL('/admin/', requestOrigin(context.request));
  url.searchParams.set('map', 'company');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return context.redirect(url.toString(), 302);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isGoogleBusinessProfileOAuthConfigured()) {
    return adminRedirect(context, { gbp_error: 'not_configured' });
  }

  const origin = requestOrigin(context.request);
  const redirectUri = googleBusinessProfileCallbackUrl(origin);
  const state = base64url(randomBytes(24));

  context.cookies.set(
    GBP_OAUTH_COOKIE,
    JSON.stringify({ state, subject: agencySubject() }),
    {
      httpOnly: true,
      secure: origin.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    },
  );

  const authorizeUrl = buildGoogleBusinessProfileAuthorizeUrl({ redirectUri, state });
  return context.redirect(authorizeUrl, 302);
}
