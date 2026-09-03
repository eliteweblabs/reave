/**
 * POST /api/admin/google-business/location — select which GBP location to sync.
 * Body: { locationId: "locations/…" | "…" }
 */
import type { APIContext } from 'astro';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { jsonResponse } from '../../../../lib/apiResponse';
import {
  getGoogleBusinessProfileConnectionStatus,
  getGoogleBusinessProfileAccessToken,
  updateGoogleBusinessProfileMeta,
} from '../../../../lib/googleBusinessProfileAuth';
import { formatGbpLocationLabel, listGbpLocations } from '../../../../lib/googleBusinessProfileClient';
import { agencySubject } from '../../../../lib/integrationTokens';

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDeploymentOwner(context);
  if (auth instanceof Response) return auth;

  let body: { locationId?: string };
  try {
    body = await context.request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const raw = String(body.locationId ?? '').trim();
  if (!raw) return jsonResponse({ error: 'locationId is required' }, 400);

  const subject = agencySubject();
  const connection = await getGoogleBusinessProfileConnectionStatus(subject);
  if (!connection.connected) {
    return jsonResponse({ error: 'Google Business Profile is not connected' }, 400);
  }

  const locationId = raw.startsWith('locations/') ? raw : `locations/${raw}`;
  let locationLabel: string | null = null;

  const cached = Array.isArray(connection.meta?.locations)
    ? (connection.meta.locations as Array<{ name?: string; label?: string; title?: string }>)
    : [];
  const hit = cached.find((row) => row.name === locationId);
  if (hit) locationLabel = hit.label || hit.title || null;

  if (!locationLabel) {
    try {
      const accessToken = await getGoogleBusinessProfileAccessToken(subject);
      const accounts = Array.isArray(connection.meta?.accounts)
        ? (connection.meta.accounts as Array<{ name?: string }>)
        : [];
      for (const account of accounts) {
        if (!account.name) continue;
        const rows = await listGbpLocations(accessToken, account.name);
        const match = rows.find((row) => row.name === locationId);
        if (match) {
          locationLabel = formatGbpLocationLabel(match);
          break;
        }
      }
    } catch {
      /* label optional */
    }
  }

  const ok = await updateGoogleBusinessProfileMeta(subject, {
    locationId,
    locationLabel,
  });
  if (!ok) return jsonResponse({ error: 'Failed to save location selection' }, 500);

  return jsonResponse({
    ok: true,
    locationId,
    locationLabel,
  });
}
