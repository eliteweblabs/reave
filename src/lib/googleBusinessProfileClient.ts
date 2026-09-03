/**
 * Google Business Profile — Account Management + Business Information APIs.
 */
import {
  getGoogleBusinessProfileAccessToken,
  GoogleBusinessProfileAuthError,
  GOOGLE_BUSINESS_PROFILE_PROVIDER,
} from './googleBusinessProfileAuth';
import { businessHoursToGbpRegularHours, type GbpRegularHours } from './gbpHours';
import type { BusinessHours } from './businessHours';
import {
  agencySubject,
  getIntegrationToken,
  type IntegrationSubject,
} from './integrationTokens';

const ACCOUNT_API = 'https://mybusinessaccountmanagement.googleapis.com/v1';
const BUSINESS_INFO_API = 'https://mybusinessbusinessinformation.googleapis.com/v1';

export type GbpAccount = {
  name: string;
  accountName?: string;
  type?: string;
};

export type GbpLocation = {
  name: string;
  title?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
  };
};

export class GoogleBusinessProfileApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code = 'GBP_API') {
    super(message);
    this.name = 'GoogleBusinessProfileApiError';
    this.status = status;
    this.code = code;
  }
}

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

function parseApiError(status: number, body: string): GoogleBusinessProfileApiError {
  let message = body.slice(0, 400);
  try {
    const data = JSON.parse(body) as {
      error?: { message?: string; status?: string; code?: number };
    };
    message =
      data.error?.message ||
      `${data.error?.status ?? 'error'} (${data.error?.code ?? status})`;
  } catch {
    /* use raw slice */
  }

  if (status === 403 && /quota|not enabled|access not configured|permission/i.test(message)) {
    return new GoogleBusinessProfileApiError(
      `Google Business Profile API access is not enabled for this Cloud project yet. ` +
        `Apply for Basic API Access on the longstanding company GCP project, then retry. ` +
        `Detail: ${message}`,
      status,
      'GBP_API_NOT_APPROVED',
    );
  }

  return new GoogleBusinessProfileApiError(message, status);
}

export async function listGbpAccounts(accessToken: string): Promise<GbpAccount[]> {
  const res = await gbpFetch(accessToken, `${ACCOUNT_API}/accounts`);
  const body = await res.text();
  if (!res.ok) throw parseApiError(res.status, body);
  const data = JSON.parse(body) as { accounts?: GbpAccount[] };
  return Array.isArray(data.accounts) ? data.accounts : [];
}

export async function listGbpLocations(
  accessToken: string,
  accountName: string,
): Promise<GbpLocation[]> {
  const accountId = accountName.replace(/^accounts\//, '');
  const readMask = encodeURIComponent('name,title,storefrontAddress');
  const url = `${BUSINESS_INFO_API}/accounts/${encodeURIComponent(accountId)}/locations?readMask=${readMask}&pageSize=100`;
  const res = await gbpFetch(accessToken, url);
  const body = await res.text();
  if (!res.ok) throw parseApiError(res.status, body);
  const data = JSON.parse(body) as { locations?: GbpLocation[] };
  return Array.isArray(data.locations) ? data.locations : [];
}

export function formatGbpLocationLabel(location: GbpLocation): string {
  const title = String(location.title ?? '').trim() || 'Untitled location';
  const lines = location.storefrontAddress?.addressLines ?? [];
  const locality = location.storefrontAddress?.locality ?? '';
  const address = [...lines, locality].filter(Boolean).join(', ');
  return address ? `${title} — ${address}` : title;
}

export async function discoverGbpLocations(
  subject: IntegrationSubject = agencySubject(),
): Promise<{ accounts: GbpAccount[]; locations: GbpLocation[] }> {
  const accessToken = await getGoogleBusinessProfileAccessToken(subject);
  const accounts = await listGbpAccounts(accessToken);
  const locations: GbpLocation[] = [];
  for (const account of accounts) {
    if (!account.name) continue;
    try {
      const rows = await listGbpLocations(accessToken, account.name);
      locations.push(...rows);
    } catch (e) {
      console.warn('[gbp] list locations failed', account.name, e);
    }
  }
  return { accounts, locations };
}

export function selectedGbpLocationId(meta: Record<string, unknown> | null): string | null {
  const raw = meta?.locationId ?? meta?.selectedLocationId;
  const id = String(raw ?? '').trim();
  return id || null;
}

export function selectedGbpLocationName(meta: Record<string, unknown> | null): string | null {
  const id = selectedGbpLocationId(meta);
  if (!id) return null;
  return id.startsWith('locations/') ? id : `locations/${id}`;
}

export async function patchGbpRegularHours(args: {
  subject?: IntegrationSubject;
  locationName?: string | null;
  regularHours: GbpRegularHours;
  validateOnly?: boolean;
}): Promise<{ locationName: string; validateOnly: boolean }> {
  const subject = args.subject ?? agencySubject();
  const stored = await getIntegrationToken(subject, GOOGLE_BUSINESS_PROFILE_PROVIDER);
  const locationName =
    args.locationName?.trim() ||
    selectedGbpLocationName(stored?.meta ?? null);
  if (!locationName) {
    throw new GoogleBusinessProfileAuthError(
      'No Google Business Profile location selected. Pick a location in Admin → Company → Hours.',
    );
  }

  const locationId = locationName.replace(/^locations\//, '');
  const accessToken = await getGoogleBusinessProfileAccessToken(subject);
  const params = new URLSearchParams({
    updateMask: 'regularHours',
  });
  if (args.validateOnly) params.set('validateOnly', 'true');

  const res = await gbpFetch(
    accessToken,
    `${BUSINESS_INFO_API}/locations/${encodeURIComponent(locationId)}?${params}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ regularHours: args.regularHours }),
    },
  );
  const body = await res.text();
  if (!res.ok) throw parseApiError(res.status, body);
  return { locationName, validateOnly: Boolean(args.validateOnly) };
}

export async function syncBusinessHoursToGbp(args: {
  subject?: IntegrationSubject;
  hours: BusinessHours | null | undefined;
  validateOnly?: boolean;
}): Promise<{ ok: true; locationName: string; periodCount: number } | { ok: false; reason: string }> {
  const regularHours = businessHoursToGbpRegularHours(args.hours);
  if (!regularHours) {
    return { ok: false, reason: 'no company hours to sync' };
  }
  try {
    const result = await patchGbpRegularHours({
      subject: args.subject,
      regularHours,
      validateOnly: args.validateOnly,
    });
    return {
      ok: true,
      locationName: result.locationName,
      periodCount: regularHours.periods.length,
    };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return { ok: false, reason };
  }
}

export async function probeGbpApiAccess(
  subject: IntegrationSubject = agencySubject(),
): Promise<{ ok: true; accountCount: number } | { ok: false; code: string; message: string }> {
  try {
    const accessToken = await getGoogleBusinessProfileAccessToken(subject);
    const accounts = await listGbpAccounts(accessToken);
    return { ok: true, accountCount: accounts.length };
  } catch (e) {
    if (e instanceof GoogleBusinessProfileAuthError) {
      return { ok: false, code: 'not_connected', message: e.message };
    }
    if (e instanceof GoogleBusinessProfileApiError) {
      return { ok: false, code: e.code, message: e.message };
    }
    return { ok: false, code: 'GBP_PROBE_FAILED', message: e instanceof Error ? e.message : String(e) };
  }
}
