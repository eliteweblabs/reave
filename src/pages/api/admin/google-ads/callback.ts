/**
 * GET /api/admin/google-ads/callback — Google Ads OAuth redirect.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { requestOrigin } from '../../../../lib/requestOrigin.ts';
import type { IntegrationSubject } from '../../../../lib/integrationTokens';
import {
  exchangeGoogleAdsCode,
  googleAdsCallbackUrl,
  isGoogleAdsOAuthConfigured,
  storeGoogleAdsTokens,
} from '../../../../lib/googleAdsAuth';
import { GOOGLE_ADS_OAUTH_COOKIE } from './connect';

export const prerender = false;

function adminRedirect(context: APIContext, params: Record<string, string>): Response {
  const url = new URL('/admin/', requestOrigin(context.request));
  url.searchParams.set('map', 'analytics');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  context.cookies.delete(GOOGLE_ADS_OAUTH_COOKIE, { path: '/' });
  return context.redirect(url.toString(), 302);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isGoogleAdsOAuthConfigured()) {
    return adminRedirect(context, { google_ads_error: 'not_configured' });
  }

  const url = new URL(context.request.url);
  if (url.searchParams.get('error')) {
    return adminRedirect(context, { google_ads_error: 'denied' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return adminRedirect(context, { google_ads_error: 'missing_code' });
  }

  const cookieRaw = context.cookies.get(GOOGLE_ADS_OAUTH_COOKIE)?.value;
  let saved: { state?: string; subject?: IntegrationSubject } = {};
  try {
    saved = cookieRaw ? JSON.parse(cookieRaw) : {};
  } catch {
    saved = {};
  }
  if (!saved.state || saved.state !== state || !saved.subject) {
    return adminRedirect(context, { google_ads_error: 'state_mismatch' });
  }

  try {
    const tokens = await exchangeGoogleAdsCode({
      code,
      redirectUri: googleAdsCallbackUrl(requestOrigin(context.request)),
    });
    await storeGoogleAdsTokens({ subject: saved.subject, tokens });
    return adminRedirect(context, { google_ads_connected: '1' });
  } catch (e) {
    console.error('[google-ads] token exchange failed', e);
    return adminRedirect(context, { google_ads_error: 'exchange_failed' });
  }
}
