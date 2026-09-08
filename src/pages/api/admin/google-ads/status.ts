/**
 * GET /api/admin/google-ads/status — OAuth + env wiring for Google Ads.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';
import {
  getGoogleAdsConnectionStatus,
  isGoogleAdsDeveloperTokenConfigured,
  isGoogleAdsOAuthConfigured,
} from '../../../../lib/googleAdsAuth';
import { resolveGoogleAdsCustomerId } from '../../../../lib/googleAdsClient';
import { agencySubject, getIntegrationToken } from '../../../../lib/integrationTokens';
import { GOOGLE_ADS_PROVIDER } from '../../../../lib/googleAdsAuth';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const subject = agencySubject();
  const oauthConfigured = isGoogleAdsOAuthConfigured();
  const developerTokenConfigured = isGoogleAdsDeveloperTokenConfigured();
  const connection = await getGoogleAdsConnectionStatus(subject);
  const token = await getIntegrationToken(subject, GOOGLE_ADS_PROVIDER);
  const customerId = resolveGoogleAdsCustomerId(token?.meta);
  const connectUrl = '/api/admin/google-ads/connect';

  return jsonResponse({
    ok: true,
    oauthConfigured,
    developerTokenConfigured,
    connected: connection.connected,
    accountLabel: connection.accountLabel,
    customerId,
    connectUrl,
    auditLog: Array.isArray(token?.meta?.auditLog) ? token!.meta!.auditLog : [],
    connectedAt: connection.connectedAt,
  });
}
