/**
 * Google Workspace Gmail API — DKIM key management.
 *
 * Uses the same Google OAuth token as GSC/GA4 (google_webmaster provider)
 * but calls the Gmail API admin endpoint: admin.googleapis.com/admin/v1/domains.
 *
 * Required scope: https://www.googleapis.com/auth/admin.directory.domain
 * (included in GOOGLE_WEBMASTER_SCOPES when google-workspace-dkim plugin is active)
 *
 * Supported actions:
 *   get_dkim_settings  — fetch current DKIM config for a domain
 *   generate_dkim_key  — generate a new RSA keypair (2048 bit) via Google
 *   enable_dkim        — enable DKIM signing after the TXT is published
 *   disable_dkim       — disable DKIM signing
 */
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  getGoogleWebmasterAccessToken,
} from './googleWebmasterAuth';
import { agencySubject } from './integrationTokens';

export interface DkimSettings {
  kind: string;
  primaryDomain: string;
  dkimEnabled: boolean;
  dkimUpdatedTime: string | null;
  rsa2048BitKey: string | null;
  publicKeyTagName: string | null;
  domainName: string;
}

async function gmailAdminFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const subject = agencySubject();
  let accessToken: string;
  try {
    accessToken = await getGoogleWebmasterAccessToken(subject);
  } catch (e) {
    if (e instanceof AnalyticsAuthError) throw e;
    throw new AnalyticsAuthError(e instanceof Error ? e.message : String(e));
  }

  const method = opts.method ?? 'GET';
  const url = path.startsWith('https://')
    ? path
    : `https://admin.googleapis.com/admin/v1${path.startsWith('/') ? path : `/${path}`}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    let detail = '';
    try {
      detail = JSON.parse(text)?.error?.message ?? '';
    } catch {}
    throw new AnalyticsAuthError(
      `Google Admin API ${res.status}${detail ? `: ${detail}` : ''}. ` +
        'The Google account may need re-authorization with admin.directory.domain scope.',
      res.status,
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = JSON.parse(text)?.error?.message ?? '';
    } catch {}
    throw new AnalyticsApiError(
      `Google Admin API error ${res.status}${detail ? `: ${detail}` : ''}`,
      res.status,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AnalyticsApiError('Google Admin API returned non-JSON response', res.status);
  }
}

/**
 * Fetch current DKIM settings for a domain.
 * domain: bare domain, e.g. "example.com"
 */
export async function getDkimSettings(domain: string): Promise<DkimSettings> {
  const encoded = encodeURIComponent(domain.trim().toLowerCase());
  return gmailAdminFetch<DkimSettings>(
    `https://admin.googleapis.com/admin/v1/domains/${encoded}/dkimSettings`,
  );
}

/**
 * Generate a new 2048-bit RSA DKIM keypair via Google.
 * This does NOT enable DKIM — call enableDkim after publishing the TXT record.
 */
export async function generateDkimKey(domain: string): Promise<DkimSettings> {
  const encoded = encodeURIComponent(domain.trim().toLowerCase());
  return gmailAdminFetch<DkimSettings>(
    `https://admin.googleapis.com/admin/v1/domains/${encoded}/dkimSettings:generateKey`,
    { method: 'POST', body: { domainName: domain.trim().toLowerCase() } },
  );
}

/**
 * Enable DKIM signing for a domain (after TXT record is published and propagated).
 */
export async function enableDkim(domain: string): Promise<DkimSettings> {
  const encoded = encodeURIComponent(domain.trim().toLowerCase());
  return gmailAdminFetch<DkimSettings>(
    `https://admin.googleapis.com/admin/v1/domains/${encoded}/dkimSettings`,
    {
      method: 'PATCH',
      body: { domainName: domain.trim().toLowerCase(), dkimEnabled: true },
    },
  );
}

/**
 * Disable DKIM signing for a domain.
 */
export async function disableDkim(domain: string): Promise<DkimSettings> {
  const encoded = encodeURIComponent(domain.trim().toLowerCase());
  return gmailAdminFetch<DkimSettings>(
    `https://admin.googleapis.com/admin/v1/domains/${encoded}/dkimSettings`,
    {
      method: 'PATCH',
      body: { domainName: domain.trim().toLowerCase(), dkimEnabled: false },
    },
  );
}

/**
 * Build the DNS TXT record content and name for a DKIM settings object.
 * Google uses the selector "google" by default.
 * Record name:  google._domainkey.{domain}
 * Record value: v=DKIM1; k=rsa; p={publicKey}
 */
export function buildDkimTxtRecord(settings: DkimSettings): {
  name: string;
  value: string;
  selector: string;
} | null {
  const key = settings.rsa2048BitKey;
  const selector = settings.publicKeyTagName ?? 'google';
  if (!key) return null;
  return {
    selector,
    name: `${selector}._domainkey`,
    value: `v=DKIM1; k=rsa; p=${key}`,
  };
}
