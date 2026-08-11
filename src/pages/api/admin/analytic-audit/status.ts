/**
 * GET /api/admin/analytic-audit/status — Google / Plausible / IndexNow connection status.
 * DELETE — disconnect agency Google token (?contact_uid= for per-client).
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { json } from '../../../../lib/apiJson';
import {
  agencySubject,
  contactSubject,
  deleteIntegrationToken,
  getIntegrationToken,
  toIntegrationStatus,
} from '../../../../lib/integrationTokens';
import {
  GOOGLE_WEBMASTER_PROVIDER,
  isGoogleWebmasterOAuthConfigured,
} from '../../../../lib/googleWebmasterAuth';
import { isPlausibleConfigured, plausibleSiteId } from '../../../../lib/plausibleClient';
import { isIndexNowConfigured } from '../../../../lib/indexNowClient';
import { isBingWebmasterConfigured } from '../../../../lib/bingWebmasterClient';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { hasFeature } from '../../../../lib/features';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const contactUid = url.searchParams.get('contact_uid')?.trim() || '';
  const subject = contactUid ? contactSubject(contactUid) : agencySubject();

  const token = await getIntegrationToken(subject, GOOGLE_WEBMASTER_PROVIDER);
  const google = toIntegrationStatus(token, subject, GOOGLE_WEBMASTER_PROVIDER);
  const company = await getCompanyConfig(context.request);

  return json({
    ok: true,
    featureEnabled: hasFeature('analytic_audit'),
    googleOAuthConfigured: isGoogleWebmasterOAuthConfigured(),
    google,
    plausible: {
      configured: isPlausibleConfigured(),
      siteId: plausibleSiteId(company.domain),
    },
    indexNow: { configured: isIndexNowConfigured() },
    bing: { configured: isBingWebmasterConfigured(), placeholder: true },
    connectUrl: contactUid
      ? `/api/admin/analytic-audit/connect?contact_uid=${encodeURIComponent(contactUid)}`
      : '/api/admin/analytic-audit/connect',
  });
}

export async function DELETE(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const url = new URL(context.request.url);
  const contactUid = url.searchParams.get('contact_uid')?.trim() || '';
  const subject = contactUid ? contactSubject(contactUid) : agencySubject();
  await deleteIntegrationToken(subject, GOOGLE_WEBMASTER_PROVIDER);
  return json({ ok: true, disconnected: true, subject });
}
