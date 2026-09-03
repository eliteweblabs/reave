/**
 * GET /api/admin/google-business/status — OAuth + API probe for Company panel.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { jsonResponse } from '../../../../lib/apiResponse';
import {
  getGoogleBusinessProfileConnectionStatus,
  isGoogleBusinessProfileOAuthConfigured,
} from '../../../../lib/googleBusinessProfileAuth';
import {
  discoverGbpLocations,
  formatGbpLocationLabel,
  probeGbpApiAccess,
  selectedGbpLocationId,
} from '../../../../lib/googleBusinessProfileClient';
import { agencySubject } from '../../../../lib/integrationTokens';

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  const subject = agencySubject();
  const oauthConfigured = isGoogleBusinessProfileOAuthConfigured();
  const connection = await getGoogleBusinessProfileConnectionStatus(subject);
  const connectUrl = '/api/admin/google-business/connect';

  if (!oauthConfigured) {
    return jsonResponse({
      ok: true,
      oauthConfigured: false,
      connected: false,
      connectUrl,
      apiAccess: { ok: false, code: 'not_configured', message: 'Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET.' },
      locations: [],
      selectedLocationId: null,
      selectedLocationLabel: null,
    });
  }

  if (!connection.connected) {
    return jsonResponse({
      ok: true,
      oauthConfigured: true,
      connected: false,
      accountLabel: null,
      connectUrl,
      apiAccess: { ok: false, code: 'not_connected', message: 'Connect Google Business Profile to continue.' },
      locations: [],
      selectedLocationId: null,
      selectedLocationLabel: null,
    });
  }

  const probe = await probeGbpApiAccess(subject);
  let locations = Array.isArray(connection.meta?.locations)
    ? (connection.meta.locations as Array<{ name?: string; title?: string; label?: string }>)
    : [];

  if (probe.ok && !locations.length) {
    try {
      const discovered = await discoverGbpLocations(subject);
      locations = discovered.locations.map((loc) => ({
        name: loc.name,
        title: loc.title,
        label: formatGbpLocationLabel(loc),
      }));
    } catch {
      /* keep empty */
    }
  }

  const selectedLocationId = selectedGbpLocationId(connection.meta);
  const selectedRow = locations.find((loc) => loc.name === selectedLocationId);
  const selectedLocationLabel =
    (typeof connection.meta?.locationLabel === 'string' ? connection.meta.locationLabel : null) ||
    selectedRow?.label ||
    selectedRow?.title ||
    null;

  return jsonResponse({
    ok: true,
    oauthConfigured: true,
    connected: true,
    accountLabel: connection.accountLabel,
    connectUrl,
    apiAccess: probe,
    locations,
    selectedLocationId,
    selectedLocationLabel,
    connectedAt: connection.connectedAt,
  });
}
