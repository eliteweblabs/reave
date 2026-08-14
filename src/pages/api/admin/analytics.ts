/**
 * GET /api/admin/analytics — Plausible (default) or GA4 web analytics.
 *
 * Query:
 *   range=7|30|90
 *   source=plausible|ga4
 *   site_id=… (Plausible)
 *   property_id=… (GA4)
 *   contact_uid=… (per-client token / meta)
 */
import type { APIContext } from 'astro';
import { json } from '../../../lib/apiJson';
import { buildAnalyticsDashboard } from '../../../lib/analyticsDashboard';
import { getCompanyConfig } from '../../../lib/companyConfig';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import {
  agencySubject,
  contactSubject,
  getIntegrationToken,
  setIntegrationToken,
} from '../../../lib/integrationTokens';
import { GOOGLE_WEBMASTER_PROVIDER } from '../../../lib/googleWebmasterAuth';

export const prerender = false;


function parseRange(raw: string | null): number {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(context.request.url);
    const rangeDays = parseRange(url.searchParams.get('range'));
    const company = await getCompanyConfig(context.request);
    const dashboard = await buildAnalyticsDashboard(company.domain, {
      rangeDays,
      source: url.searchParams.get('source'),
      siteId: url.searchParams.get('site_id'),
      ga4PropertyId: url.searchParams.get('property_id'),
      contactUid: url.searchParams.get('contact_uid'),
    });
    return json({ ok: true, dashboard });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load analytics';
    return json({ ok: false, error: message }, 500);
  }
}

/** PATCH — save preferred GA4 property id on agency or contact token meta. */
export async function PATCH(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown> = {};
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const contactUid = typeof body.contact_uid === 'string' ? body.contact_uid.trim() : '';
  const subject = contactUid ? contactSubject(contactUid) : agencySubject();
  const token = await getIntegrationToken(subject, GOOGLE_WEBMASTER_PROVIDER);
  if (!token) {
    return json({ ok: false, error: 'Google is not connected for this subject' }, 400);
  }

  const meta = { ...(token.meta || {}) };
  if (typeof body.ga4_property_id === 'string') {
    meta.ga4PropertyId = body.ga4_property_id.trim();
  }
  if (typeof body.plausible_site_id === 'string') {
    meta.plausibleSiteId = body.plausible_site_id.trim();
  }
  if (typeof body.preferred_source === 'string') {
    meta.preferredSource = body.preferred_source.trim();
  }

  await setIntegrationToken({
    subject,
    provider: GOOGLE_WEBMASTER_PROVIDER,
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    scope: token.scope,
    expiresAt: token.expiresAt,
    accountLabel: token.accountLabel,
    meta,
  });

  return json({ ok: true, meta });
}
