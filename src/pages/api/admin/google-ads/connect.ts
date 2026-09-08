/**
 * GET /api/admin/google-ads/connect — start Google Ads OAuth.
 */
import type { APIContext } from 'astro';
import { randomBytes } from 'node:crypto';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { requestOrigin } from '../../../../lib/requestOrigin.ts';
import { agencySubject, contactSubject, type IntegrationSubject } from '../../../../lib/integrationTokens';
import {
  buildGoogleAdsAuthorizeUrl,
  googleAdsCallbackUrl,
  isGoogleAdsOAuthConfigured,
} from '../../../../lib/googleAdsAuth';

export const prerender = false;

export const GOOGLE_ADS_OAUTH_COOKIE = 'google_ads_oauth';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function adminRedirect(context: APIContext, params: Record<string, string>): Response {
  const url = new URL('/admin/', requestOrigin(context.request));
  url.searchParams.set('map', 'analytics');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return context.redirect(url.toString(), 302);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isGoogleAdsOAuthConfigured()) {
    return adminRedirect(context, { google_ads_error: 'not_configured' });
  }

  const url = new URL(context.request.url);
  const contactUid = url.searchParams.get('contact_uid')?.trim() || '';
  const subject: IntegrationSubject = contactUid
    ? contactSubject(contactUid)
    : agencySubject();

  const origin = requestOrigin(context.request);
  const redirectUri = googleAdsCallbackUrl(origin);
  const state = base64url(randomBytes(24));

  context.cookies.set(
    GOOGLE_ADS_OAUTH_COOKIE,
    JSON.stringify({ state, subject }),
    {
      httpOnly: true,
      secure: origin.startsWith('https://'),
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    },
  );

  const authorizeUrl = buildGoogleAdsAuthorizeUrl({ redirectUri, state });
  return context.redirect(authorizeUrl, 302);
}
