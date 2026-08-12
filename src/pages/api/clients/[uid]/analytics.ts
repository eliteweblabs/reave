/**
 * GET /api/clients/[uid]/analytics — per-client analytics (Plausible or GA4).
 * Uses contact vault meta / integration token preferred source; never invents data.
 */
import type { APIContext } from 'astro';
import { json } from '../../../../lib/apiJson';
import { buildAnalyticsDashboard } from '../../../../lib/analyticsDashboard';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { extractPortal, getContact } from '../../../../lib/contactApi';
import {
  contactSubject,
  getIntegrationToken,
} from '../../../../lib/integrationTokens';
import { GOOGLE_WEBMASTER_PROVIDER } from '../../../../lib/googleWebmasterAuth';
import { hasFeature } from '../../../../lib/features';

export const prerender = false;


function parseRange(raw: string | null): number {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

function vaultValue(
  data: Array<{ label?: string; value?: string; url?: string }> | undefined,
  labels: string[],
): string {
  if (!Array.isArray(data)) return '';
  const wanted = new Set(labels.map((l) => l.toLowerCase()));
  for (const row of data) {
    const label = String(row.label || '').trim().toLowerCase();
    if (!wanted.has(label)) continue;
    return String(row.value || row.url || '').trim();
  }
  return '';
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!hasFeature('analytic_audit') && !hasFeature('client_portal')) {
    return json({ ok: false, error: 'Analytics not enabled' }, 404);
  }

  const uid = context.params.uid?.trim() || '';
  if (!uid) return json({ ok: false, error: 'uid required' }, 400);

  try {
    const contactRes = await getContact(uid);
    if (!contactRes.ok) {
      return json(
        { ok: false, error: contactRes.error || 'Contact not found' },
        contactRes.status && contactRes.status >= 400 ? contactRes.status : 404,
      );
    }
    const contact = contactRes.data;

    const portal = extractPortal(contact);
    const vault = portal?.data;
    const url = new URL(context.request.url);
    const rangeDays = parseRange(url.searchParams.get('range'));

    const token = await getIntegrationToken(contactSubject(uid), GOOGLE_WEBMASTER_PROVIDER);
    const preferredSource =
      url.searchParams.get('source') ||
      (token?.meta?.preferredSource != null ? String(token.meta.preferredSource) : '') ||
      vaultValue(vault, ['Analytics source', 'analytics_source', 'Preferred analytics']);

    const siteId =
      url.searchParams.get('site_id') ||
      (token?.meta?.plausibleSiteId != null ? String(token.meta.plausibleSiteId) : '') ||
      vaultValue(vault, ['Plausible site id', 'plausible_site_id', 'Plausible']);

    const propertyId =
      url.searchParams.get('property_id') ||
      (token?.meta?.ga4PropertyId != null ? String(token.meta.ga4PropertyId) : '') ||
      vaultValue(vault, ['GA4 property id', 'ga4_property_id', 'GA4']);

    const website =
      (portal?.website || '').trim() ||
      vaultValue(vault, ['Website', 'Website URL', 'Domain']) ||
      String(contact.company || '');

    // For Plausible, if no explicit site id, try hostname from website URL — still explicit intent from client record, not company settings.
    let resolvedSiteId = siteId;
    if (!resolvedSiteId && website) {
      resolvedSiteId = website
        .replace(/^https?:\/\//i, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./i, '');
    }

    if (!resolvedSiteId && !propertyId && preferredSource !== 'ga4') {
      return json({
        ok: true,
        dashboard: {
          configured: false,
          source: 'plausible',
          siteId: '',
          rangeDays,
          period: `${rangeDays}d`,
          dashboardUrl: null,
          realtimeVisitors: null,
          metrics: {
            visitors: { value: 0, change: null },
            pageviews: { value: 0, change: null },
            bounceRate: { value: 0, change: null },
            visitDuration: { value: 0, change: null },
          },
          series: [],
          topPages: [],
          topSources: [],
          availableSources: [],
          error: 'No Plausible site id or GA4 property configured for this client',
        },
      });
    }

    const dashboard = await buildAnalyticsDashboard('', {
      rangeDays,
      source: preferredSource || (propertyId && !resolvedSiteId ? 'ga4' : 'plausible'),
      siteId: resolvedSiteId,
      ga4PropertyId: propertyId,
      contactUid: uid,
    });

    return json({ ok: true, dashboard, contactUid: uid });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load client analytics';
    return json({ ok: false, error: message }, 500);
  }
}
