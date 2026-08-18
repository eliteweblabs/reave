/**
 * Google Workspace Admin SDK — Domains resource.
 *
 * Lists all domains on a Google Workspace account (primary, secondary, aliases).
 * This is critical for knowing whether a client domain is a secondary domain
 * (gets its own DKIM key) vs a domain alias (shares primary domain's DKIM).
 *
 * Required scope: https://www.googleapis.com/auth/admin.directory.domain
 * API: https://admin.googleapis.com/admin/directory/v1/customer/my_customer/domains
 */
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  getGoogleWebmasterAccessToken,
} from './googleWebmasterAuth';
import { agencySubject } from './integrationTokens';

export interface WorkspaceDomain {
  domainName: string;
  isPrimary: boolean;
  isVerified: boolean;
  creationTime: number | null;
  domainAliases?: WorkspaceDomainAlias[];
}

export interface WorkspaceDomainAlias {
  domainAliasName: string;
  isVerified: boolean;
  creationTime: number | null;
  parentDomainName: string;
}

export interface WorkspaceDomainsResponse {
  kind: string;
  domains: WorkspaceDomain[];
}

async function workspaceAdminFetch<T>(
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
    : `https://admin.googleapis.com${path.startsWith('/') ? path : `/${path}`}`;

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
      detail = (JSON.parse(text) as any)?.error?.message ?? '';
    } catch {}
    throw new AnalyticsAuthError(
      `Google Admin API ${res.status}${detail ? `: ${detail}` : ''}. ` +
        'Re-authorize Google in Admin → Analytics.',
      res.status,
    );
  }

  if (!res.ok) {
    let detail = '';
    try {
      detail = (JSON.parse(text) as any)?.error?.message ?? '';
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
 * List all domains on the Google Workspace account.
 * Returns primary domain, secondary domains, and domain aliases.
 */
export async function listWorkspaceDomains(): Promise<WorkspaceDomainsResponse> {
  return workspaceAdminFetch<WorkspaceDomainsResponse>(
    '/admin/directory/v1/customer/my_customer/domains',
  );
}

/**
 * Get details for a specific domain by name.
 */
export async function getWorkspaceDomain(domain: string): Promise<WorkspaceDomain> {
  const encoded = encodeURIComponent(domain.trim().toLowerCase());
  return workspaceAdminFetch<WorkspaceDomain>(
    `/admin/directory/v1/customer/my_customer/domains/${encoded}`,
  );
}
