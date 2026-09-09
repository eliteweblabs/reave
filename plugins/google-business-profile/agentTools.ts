/**
 * Agent tool: google_business_profile
 *
 * Provides the agent with read/write access to Google Business Profile
 * via the Business Information API v1.
 *
 * Actions:
 *   status          — OAuth connection status + API probe + location list
 *   list_locations  — list all GBP locations across all accounts
 *   get_location    — fetch full details for a single location
 *   update_location — PATCH a location (name, phone, website, hours, etc.)
 *   sync_hours      — push company hours to GBP regularHours
 *   select_location — save the active location for future syncs
 *
 * Requires: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GBP OAuth connected
 * (Admin → Company → Hours → Connect Google Business Profile)
 */
import {
  getGoogleBusinessProfileAccessToken,
  getGoogleBusinessProfileConnectionStatus,
  isGoogleBusinessProfileOAuthConfigured,
  GoogleBusinessProfileAuthError,
  GOOGLE_BUSINESS_PROFILE_PROVIDER,
  updateGoogleBusinessProfileMeta,
} from '../../src/lib/googleBusinessProfileAuth';
import {
  discoverGbpLocations,
  formatGbpLocationLabel,
  listGbpLocations,
  probeGbpApiAccess,
  selectedGbpLocationId,
} from '../../src/lib/googleBusinessProfileClient';
import { agencySubject, getIntegrationToken } from '../../src/lib/integrationTokens';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

const BUSINESS_INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function gbpFetch(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

function parseApiError(status: number, body: string): Error {
  let message = body.slice(0, 400);
  try {
    const data = JSON.parse(body) as { error?: { message?: string } };
    if (data.error?.message) message = data.error.message;
  } catch { /* use raw */ }
  return new Error(`GBP API ${status}: ${message}`);
}

function normalizeLocationId(raw: string): string {
  const s = raw.trim();
  return s.startsWith('locations/') ? s : `locations/${s}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: status
// ─────────────────────────────────────────────────────────────────────────────

async function handle_status(_args: Record<string, unknown>): Promise<string> {
  const oauthConfigured = isGoogleBusinessProfileOAuthConfigured();
  if (!oauthConfigured) {
    return JSON.stringify({
      ok: false,
      oauthConfigured: false,
      error: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable GBP.',
    });
  }

  const subject = agencySubject();
  const connection = await getGoogleBusinessProfileConnectionStatus(subject);

  if (!connection.connected) {
    return JSON.stringify({
      ok: false,
      oauthConfigured: true,
      connected: false,
      connectUrl: '/api/admin/google-business/connect',
      error: 'Google Business Profile is not connected. Visit Admin → Company → Hours to connect.',
    });
  }

  const probe = await probeGbpApiAccess(subject);
  const stored = await getIntegrationToken(subject, GOOGLE_BUSINESS_PROFILE_PROVIDER);
  const selectedLocationId = selectedGbpLocationId(stored?.meta ?? null);

  let locations: Array<{ name: string; label: string }> = [];
  if (probe.ok) {
    try {
      const discovered = await discoverGbpLocations(subject);
      locations = discovered.locations.map((loc) => ({
        name: loc.name ?? '',
        label: formatGbpLocationLabel(loc),
      }));
    } catch { /* probe.ok already true */ }
  }

  return JSON.stringify({
    ok: true,
    oauthConfigured: true,
    connected: true,
    accountLabel: connection.accountLabel,
    apiAccess: probe,
    selectedLocationId,
    locations,
    connectedAt: connection.connectedAt,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: list_locations
// ─────────────────────────────────────────────────────────────────────────────

async function handle_list_locations(_args: Record<string, unknown>): Promise<string> {
  const subject = agencySubject();
  try {
    const { accounts, locations } = await discoverGbpLocations(subject);
    return JSON.stringify({
      ok: true,
      accountCount: accounts.length,
      locationCount: locations.length,
      locations: locations.map((loc) => ({
        name: loc.name,
        title: loc.title,
        label: formatGbpLocationLabel(loc),
        address: loc.storefrontAddress,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: get_location
// ─────────────────────────────────────────────────────────────────────────────

const FULL_READ_MASK = [
  'name',
  'title',
  'phoneNumbers',
  'categories',
  'storefrontAddress',
  'websiteUri',
  'regularHours',
  'specialHours',
  'serviceArea',
  'labels',
  'adWordsLocationExtensions',
  'latlng',
  'openInfo',
  'metadata',
  'profile',
  'relationshipData',
  'moreHours',
].join(',');

async function handle_get_location(args: Record<string, unknown>): Promise<string> {
  const locationIdRaw = String(args.location_id ?? '').trim();
  if (!locationIdRaw) return JSON.stringify({ ok: false, error: 'location_id is required' });

  const locationId = normalizeLocationId(locationIdRaw).replace(/^locations\//, '');
  const subject = agencySubject();

  try {
    const accessToken = await getGoogleBusinessProfileAccessToken(subject);
    const url = `${BUSINESS_INFO_API}/locations/${encodeURIComponent(locationId)}?readMask=${encodeURIComponent(FULL_READ_MASK)}`;
    const res = await gbpFetch(accessToken, url);
    const body = await res.text();
    if (!res.ok) throw parseApiError(res.status, body);
    const data = JSON.parse(body);
    return JSON.stringify({ ok: true, location: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: update_location
// ─────────────────────────────────────────────────────────────────────────────

async function handle_update_location(args: Record<string, unknown>): Promise<string> {
  const locationIdRaw = String(args.location_id ?? '').trim();
  if (!locationIdRaw) return JSON.stringify({ ok: false, error: 'location_id is required' });

  const updateMask = String(args.update_mask ?? '').trim();
  if (!updateMask) return JSON.stringify({ ok: false, error: 'update_mask is required (comma-separated field names, e.g. "title,websiteUri")' });

  const payload = args.payload;
  if (!payload || typeof payload !== 'object') {
    return JSON.stringify({ ok: false, error: 'payload is required (object with the fields to update)' });
  }

  const locationId = normalizeLocationId(locationIdRaw).replace(/^locations\//, '');
  const subject = agencySubject();

  try {
    const accessToken = await getGoogleBusinessProfileAccessToken(subject);
    const url = `${BUSINESS_INFO_API}/locations/${encodeURIComponent(locationId)}?updateMask=${encodeURIComponent(updateMask)}`;
    const res = await gbpFetch(accessToken, url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    if (!res.ok) throw parseApiError(res.status, body);
    const data = JSON.parse(body);
    return JSON.stringify({ ok: true, updated: data, updateMask });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: sync_hours
// ─────────────────────────────────────────────────────────────────────────────

async function handle_sync_hours(_args: Record<string, unknown>): Promise<string> {
  // Call the existing sync-hours API internally
  try {
    const res = await fetch('/api/admin/google-business/sync-hours', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-agent-internal': '1' },
    });
    const body = await res.text();
    const data = JSON.parse(body);
    return JSON.stringify(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action: select_location
// ─────────────────────────────────────────────────────────────────────────────

async function handle_select_location(args: Record<string, unknown>): Promise<string> {
  const locationIdRaw = String(args.location_id ?? '').trim();
  if (!locationIdRaw) return JSON.stringify({ ok: false, error: 'location_id is required' });

  const locationId = normalizeLocationId(locationIdRaw);
  const subject = agencySubject();

  try {
    const connection = await getGoogleBusinessProfileConnectionStatus(subject);
    if (!connection.connected) {
      return JSON.stringify({ ok: false, error: 'Google Business Profile is not connected.' });
    }

    // Resolve label from cached locations
    let locationLabel: string | null = null;
    const cached = Array.isArray(connection.meta?.locations)
      ? (connection.meta.locations as Array<{ name?: string; label?: string; title?: string }>)
      : [];
    const hit = cached.find((row) => row.name === locationId);
    if (hit) locationLabel = hit.label || hit.title || null;

    const ok = await updateGoogleBusinessProfileMeta(subject, { locationId, locationLabel });
    if (!ok) return JSON.stringify({ ok: false, error: 'Failed to save location selection.' });

    return JSON.stringify({ ok: true, locationId, locationLabel });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return JSON.stringify({ ok: false, error: msg });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler dispatcher
// ─────────────────────────────────────────────────────────────────────────────

async function handle_google_business_profile(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const action = String(args.action ?? '').trim();

  switch (action) {
    case 'status':
      return handle_status(args);
    case 'list_locations':
      return handle_list_locations(args);
    case 'get_location':
      return handle_get_location(args);
    case 'update_location':
      return handle_update_location(args);
    case 'sync_hours':
      return handle_sync_hours(args);
    case 'select_location':
      return handle_select_location(args);
    default:
      return JSON.stringify({
        ok: false,
        error: `Unknown action "${action}". Valid: status, list_locations, get_location, update_location, sync_hours, select_location`,
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool definition
// ─────────────────────────────────────────────────────────────────────────────

export const googleBusinessProfileAgentTools: AgentToolModule = {
  id: 'google-business-profile',
  enabled: (_ctx: ToolContext) => isGoogleBusinessProfileOAuthConfigured(),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'google_business_profile',
          description:
            'Manage the connected Google Business Profile — check connection status, list locations, read full location details (name, phone, website, hours, address, categories), update any field, sync company hours, or select the active location. Requires GBP OAuth connected in Admin → Company → Hours.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [
                  'status',
                  'list_locations',
                  'get_location',
                  'update_location',
                  'sync_hours',
                  'select_location',
                ],
                description:
                  'status = connection info + location list; list_locations = all locations; get_location = full details for one location; update_location = PATCH fields; sync_hours = push company hours to GBP; select_location = set active location for future syncs.',
              },
              location_id: {
                type: 'string',
                description:
                  'Location resource name or bare id, e.g. "locations/12345678" or "12345678". Required for get_location, update_location, select_location.',
              },
              update_mask: {
                type: 'string',
                description:
                  'Comma-separated field paths to update, e.g. "title,websiteUri,phoneNumbers,regularHours". Required for update_location.',
              },
              payload: {
                type: 'object',
                description:
                  'Field values to write. Must match the GBP Business Information API v1 Location schema. Required for update_location. Example: { "title": "Elite Web Labs", "websiteUri": "https://eliteweblabs.com", "phoneNumbers": { "primaryPhone": "+18631234567" } }',
                additionalProperties: true,
              },
            },
            required: ['action'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    google_business_profile: handle_google_business_profile,
  },
};
