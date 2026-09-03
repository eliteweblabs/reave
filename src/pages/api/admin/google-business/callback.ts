/**
 * GET /api/admin/google-business/callback — GBP OAuth redirect.
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { requestOrigin } from '../../../../lib/requestOrigin.ts';
import type { IntegrationSubject } from '../../../../lib/integrationTokens';
import {
  discoverGbpLocations,
  formatGbpLocationLabel,
  selectedGbpLocationId,
} from '../../../../lib/googleBusinessProfileClient';
import {
  exchangeGoogleBusinessProfileCode,
  googleBusinessProfileCallbackUrl,
  isGoogleBusinessProfileOAuthConfigured,
  storeGoogleBusinessProfileTokens,
  updateGoogleBusinessProfileMeta,
} from '../../../../lib/googleBusinessProfileAuth';
import { GBP_OAUTH_COOKIE } from './connect';

export const prerender = false;

function adminRedirect(context: APIContext, params: Record<string, string>): Response {
  const url = new URL('/admin/', requestOrigin(context.request));
  url.searchParams.set('map', 'company');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  context.cookies.delete(GBP_OAUTH_COOKIE, { path: '/' });
  return context.redirect(url.toString(), 302);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (!isGoogleBusinessProfileOAuthConfigured()) {
    return adminRedirect(context, { gbp_error: 'not_configured' });
  }

  const url = new URL(context.request.url);
  if (url.searchParams.get('error')) {
    return adminRedirect(context, { gbp_error: 'denied' });
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) {
    return adminRedirect(context, { gbp_error: 'missing_code' });
  }

  const cookieRaw = context.cookies.get(GBP_OAUTH_COOKIE)?.value;
  let saved: { state?: string; subject?: IntegrationSubject } = {};
  try {
    saved = cookieRaw ? JSON.parse(cookieRaw) : {};
  } catch {
    saved = {};
  }
  if (!saved.state || saved.state !== state || !saved.subject) {
    return adminRedirect(context, { gbp_error: 'state_mismatch' });
  }

  try {
    const tokens = await exchangeGoogleBusinessProfileCode({
      code,
      redirectUri: googleBusinessProfileCallbackUrl(requestOrigin(context.request)),
    });
    await storeGoogleBusinessProfileTokens({ subject: saved.subject, tokens });

    let meta: Record<string, unknown> = {};
    try {
      const { accounts, locations } = await discoverGbpLocations(saved.subject);
      meta = {
        accounts: accounts.map((a) => ({ name: a.name, accountName: a.accountName ?? null })),
        locations: locations.map((loc) => ({
          name: loc.name,
          title: loc.title ?? null,
          label: formatGbpLocationLabel(loc),
        })),
      };
      if (locations.length === 1 && locations[0]?.name) {
        meta.locationId = locations[0].name;
        meta.locationLabel = formatGbpLocationLabel(locations[0]);
      }
      await updateGoogleBusinessProfileMeta(saved.subject, meta);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not enabled|quota|GBP_API_NOT_APPROVED|403/i.test(msg)) {
        return adminRedirect(context, { gbp_error: 'api_not_approved', gbp_detail: msg.slice(0, 180) });
      }
      console.warn('[gbp] post-connect discovery failed', e);
      return adminRedirect(context, { gbp_connected: '1', gbp_warn: 'discovery_failed' });
    }

    if (locationsNeedPick(meta)) {
      return adminRedirect(context, { gbp_connected: '1', gbp_pick_location: '1' });
    }
    return adminRedirect(context, { gbp_connected: '1' });
  } catch (e) {
    console.error('[gbp] token exchange failed', e);
    return adminRedirect(context, { gbp_error: 'exchange_failed' });
  }
}

function locationsNeedPick(meta: Record<string, unknown>): boolean {
  if (selectedGbpLocationId(meta)) return false;
  const locations = meta.locations;
  return Array.isArray(locations) && locations.length > 1;
}
