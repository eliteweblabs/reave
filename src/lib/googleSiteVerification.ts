/**
 * Google Site Verification API — DNS TXT tokens for Search Console domain properties.
 */
import {
  AnalyticsApiError,
  AnalyticsAuthError,
  getGoogleWebmasterAccessToken,
} from './googleWebmasterAuth';
import type { IntegrationSubject } from './integrationTokens';
import { agencySubject } from './integrationTokens';
import {
  cloudflareFindZone,
  cloudflareListDnsRecords,
  cloudflareUpsertDnsRecord,
} from './cloudflareClient';
import {
  isNamecomConfigured,
  namecomCreateRecord,
  namecomListRecords,
  resolveNamecomCredentials,
} from './namecomClient';
import { serverEnv } from './serverEnv.ts';

async function siteVerifyFetch<T>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    subject?: IntegrationSubject;
    query?: Record<string, string>;
  } = {},
): Promise<T> {
  const subject = opts.subject ?? agencySubject();
  let accessToken: string;
  try {
    accessToken = await getGoogleWebmasterAccessToken(subject);
  } catch (e) {
    if (e instanceof AnalyticsAuthError) throw e;
    throw new AnalyticsAuthError(e instanceof Error ? e.message : String(e));
  }

  const url = new URL(
    path.startsWith('https://')
      ? path
      : `https://www.googleapis.com/siteVerification/v1${path.startsWith('/') ? path : `/${path}`}`,
  );
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ...(opts.body != null ? { 'Content-Type': 'application/json' } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    throw new AnalyticsAuthError(
      `Site Verification auth failed (${res.status}): ${text.slice(0, 240)}`,
    );
  }
  if (res.status === 429) {
    throw new AnalyticsApiError(`Site Verification quota exceeded (429)`, 429);
  }
  if (!res.ok) {
    throw new AnalyticsApiError(
      `Site Verification ${res.status}: ${text.slice(0, 400)}`,
      res.status,
    );
  }
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function normalizeApex(domain: string): string {
  return domain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '');
}

export async function getDnsTxtVerificationToken(
  domain: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<{ token: string; method: string; identifier: string }> {
  const identifier = normalizeApex(domain);
  const data = await siteVerifyFetch<{ token?: string; method?: string }>('/token', {
    method: 'POST',
    subject,
    body: {
      site: { type: 'INET_DOMAIN', identifier },
      verificationMethod: 'DNS_TXT',
    },
  });
  if (!data.token) throw new AnalyticsApiError('No DNS TXT token returned from Site Verification');
  return { token: data.token, method: data.method || 'DNS_TXT', identifier };
}

export async function verifyDomainViaDnsTxt(
  domain: string,
  subject: IntegrationSubject = agencySubject(),
): Promise<void> {
  const identifier = normalizeApex(domain);
  await siteVerifyFetch('/webResource', {
    method: 'POST',
    subject,
    query: { verificationMethod: 'DNS_TXT' },
    body: {
      site: { type: 'INET_DOMAIN', identifier },
    },
  });
}

export type DnsVerifyAttempt = {
  provider: 'cloudflare' | 'namecom' | 'none';
  attempted: boolean;
  ok: boolean;
  detail?: string;
};

/** Try Cloudflare then Name.com (env or passed creds) to publish the Google DNS TXT token. */
export async function tryPublishGoogleDnsTxt(args: {
  domain: string;
  token: string;
  namecomUsername?: string;
  namecomToken?: string;
}): Promise<DnsVerifyAttempt> {
  const apex = normalizeApex(args.domain);

  if (serverEnv('CLOUDFLARE_API_TOKEN')?.trim()) {
    const zone = await cloudflareFindZone(apex);
    if (zone.ok && zone.data) {
      const listed = await cloudflareListDnsRecords(zone.data.id, { type: 'TXT' });
      if (!listed.ok) {
        return {
          provider: 'cloudflare',
          attempted: true,
          ok: false,
          detail: listed.error || 'Could not list Cloudflare TXT records',
        };
      }
      const upsert = await cloudflareUpsertDnsRecord(
        zone.data.id,
        {
          type: 'TXT',
          name: apex,
          content: args.token,
          ttl: 3600,
        },
        listed.data,
      );
      if (upsert.ok) {
        return {
          provider: 'cloudflare',
          attempted: true,
          ok: true,
          detail: `TXT ${upsert.data.action} on Cloudflare zone ${zone.data.name}`,
        };
      }
      return {
        provider: 'cloudflare',
        attempted: true,
        ok: false,
        detail: upsert.error || 'Cloudflare TXT upsert failed',
      };
    }
  }

  const creds = resolveNamecomCredentials({
    username: args.namecomUsername,
    token: args.namecomToken,
  });
  if (creds && isNamecomConfigured(creds)) {
    const existing = await namecomListRecords(apex, creds);
    if (!existing.ok) {
      return {
        provider: 'namecom',
        attempted: true,
        ok: false,
        detail: existing.error,
      };
    }
    const already = existing.data.some(
      (r) => String(r.type).toUpperCase() === 'TXT' && String(r.answer || '').includes(args.token),
    );
    if (!already) {
      const created = await namecomCreateRecord(
        apex,
        { host: '', type: 'TXT', answer: args.token, ttl: 300 },
        creds,
      );
      if (!created.ok) {
        return {
          provider: 'namecom',
          attempted: true,
          ok: false,
          detail: created.error,
        };
      }
    }
    return {
      provider: 'namecom',
      attempted: true,
      ok: true,
      detail: `TXT published via Name.com for ${apex}`,
    };
  }

  return {
    provider: 'none',
    attempted: false,
    ok: false,
    detail:
      'No Cloudflare or Name.com credentials available for this domain. Add the TXT record manually, then re-run verification.',
  };
}
