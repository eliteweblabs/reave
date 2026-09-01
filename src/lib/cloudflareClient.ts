/**
 * Cloudflare DNS API client (zone DNS edit token).
 * @see https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/list/
 */
import { serverEnv } from './serverEnv.ts';

const CF_API = 'https://api.cloudflare.com/client/v4';

export type CfDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  priority?: number;
  ttl: number;
  proxied?: boolean;
};

export type CfResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

function token(): string | undefined {
  return serverEnv('CLOUDFLARE_API_TOKEN')?.trim();
}

async function cfFetch<T>(path: string, init?: RequestInit): Promise<CfResult<T>> {
  const apiToken = token();
  if (!apiToken) {
    return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };
  }

  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const raw = await res.text();
  let body: { success?: boolean; errors?: { message: string }[]; result?: T; result_info?: unknown };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: 'Invalid JSON from Cloudflare', status: res.status };
  }

  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: body.result as T };
}

export function isCloudflareConfigured(): boolean {
  return Boolean(token());
}

/** Apex or subdomain → zone apex (reave.app). */
export function cloudflareZoneName(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  return parts.slice(-2).join('.');
}

/** Resend record name → FQDN within zone. */
export function fqdnRecordName(zone: string, recordName: string): string {
  const base = zone.toLowerCase().replace(/\.$/, '');
  const rel = recordName.trim().toLowerCase().replace(/\.$/, '');
  if (!rel || rel === base) return base;
  if (rel.endsWith(`.${base}`)) return rel;
  return `${rel}.${base}`;
}

function normalizeDnsContent(type: string, content: string): string {
  const t = type.toUpperCase();
  let c = content.trim();
  if (t === 'TXT' && c.startsWith('"') && c.endsWith('"')) {
    c = c.slice(1, -1);
  }
  if (t === 'MX' || t === 'CNAME') {
    c = c.replace(/\.$/, '').toLowerCase();
  }
  return c;
}

export function dnsRecordsMatch(
  existing: Pick<CfDnsRecord, 'type' | 'content' | 'priority'>,
  expected: { type: string; content: string; priority?: number },
): boolean {
  const type = expected.type.toUpperCase();
  if (existing.type.toUpperCase() !== type) return false;
  if (normalizeDnsContent(type, existing.content) !== normalizeDnsContent(type, expected.content)) {
    return false;
  }
  if (type === 'MX') {
    return (existing.priority ?? 0) === (expected.priority ?? 0);
  }
  return true;
}

/** Recognized TXT semantics for disambiguating multiple records at the same name. */
export type TxtRecordKind = 'spf' | 'dmarc' | 'google_verification' | 'unknown';

export function txtRecordKind(content: string): TxtRecordKind {
  const c = normalizeDnsContent('TXT', content).toLowerCase();
  if (c.startsWith('v=spf1')) return 'spf';
  if (c.startsWith('v=dmarc1')) return 'dmarc';
  if (c.startsWith('google-site-verification=')) return 'google_verification';
  return 'unknown';
}

type TxtUpsertPick =
  | { action: 'update'; record: CfDnsRecord }
  | { action: 'create' }
  | { action: 'error'; error: string };

/** When several TXT records share a name, pick the one to replace (or create a new one). */
export function pickTxtRecordForUpsert(
  existing: CfDnsRecord[],
  expectedContent: string,
): TxtUpsertPick {
  const host = existing[0]?.name ?? 'host';
  const kind = txtRecordKind(expectedContent);
  if (kind === 'unknown') {
    return {
      action: 'error',
      error: `Multiple TXT records for ${host}; cannot pick which to update — use v=spf1 (SPF), v=DMARC1 (DMARC), or google-site-verification=, or resolve manually in Cloudflare`,
    };
  }

  const prefix =
    kind === 'spf'
      ? 'v=spf1'
      : kind === 'dmarc'
        ? 'v=dmarc1'
        : 'google-site-verification=';
  const label =
    kind === 'spf' ? 'SPF' : kind === 'dmarc' ? 'DMARC' : 'Google site verification';
  const matches = existing.filter((r) =>
    normalizeDnsContent('TXT', r.content).toLowerCase().startsWith(prefix),
  );

  if (matches.length === 1) return { action: 'update', record: matches[0] };
  if (matches.length === 0) return { action: 'create' };
  return {
    action: 'error',
    error: `Multiple ${label} TXT records at ${host}; remove duplicates in Cloudflare first`,
  };
}

async function patchDnsRecord(
  zoneId: string,
  recordId: string,
  body: Record<string, unknown>,
): Promise<CfResult<{ action: 'updated'; record: CfDnsRecord }>> {
  const out = await cfFetch<CfDnsRecord>(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!out.ok) return out;
  return { ok: true, data: { action: 'updated', record: out.data } };
}

export async function cloudflareFindZone(zoneName: string): Promise<CfResult<{ id: string; name: string }>> {
  const verify = await cloudflareVerifyToken();
  if (!verify.ok) {
    return {
      ok: false,
      error: `Cloudflare token invalid — regenerate in Cloudflare dashboard and update CLOUDFLARE_API_TOKEN on Railway (${verify.error})`,
    };
  }

  const explicit = serverEnv('CLOUDFLARE_ZONE_ID')?.trim();
  if (explicit) {
    const out = await cfFetch<{ id: string; name: string }>(`/zones/${explicit}`);
    if (out.ok && out.data.name.toLowerCase() === zoneName.toLowerCase()) {
      return { ok: true, data: out.data };
    }
    // ZONE_ID points at a different zone — look up the requested name so client
    // domains (Google Workspace, etc.) are not written onto the company zone.
  }

  const out = await cfFetch<{ id: string; name: string }[]>(
    `/zones?name=${encodeURIComponent(zoneName)}&status=active&per_page=5`,
  );
  if (!out.ok) return out;
  const zone = out.data.find((z) => z.name.toLowerCase() === zoneName.toLowerCase());
  if (!zone) {
    return {
      ok: false,
      error: `Cloudflare zone not found for ${zoneName}. Token may lack Zone → DNS → Read/Edit on that zone — update CLOUDFLARE_API_TOKEN permissions in Cloudflare.`,
    };
  }
  return { ok: true, data: zone };
}

/** Fetch zone details including assigned nameservers. */
export async function cloudflareGetZone(zoneId: string): Promise<CfResult<CfZone>> {
  return cfFetch<CfZone>(`/zones/${zoneId}`);
}

export async function cloudflareListDnsRecords(
  zoneId: string,
  opts?: { type?: string; name?: string },
): Promise<CfResult<CfDnsRecord[]>> {
  const params = new URLSearchParams({ per_page: '100' });
  if (opts?.type) params.set('type', opts.type);
  if (opts?.name) params.set('name', opts.name);

  const records: CfDnsRecord[] = [];
  let page = 1;

  while (true) {
    params.set('page', String(page));
    const out = await cfFetch<CfDnsRecord[]>(`/zones/${zoneId}/dns_records?${params}`);
    if (!out.ok) return out;
    records.push(...out.data);
    if (out.data.length < 100) break;
    page += 1;
    if (page > 20) break;
  }

  return { ok: true, data: records };
}

export async function cloudflareUpsertDnsRecord(
  zoneId: string,
  expected: { type: string; name: string; content: string; priority?: number; ttl?: number; proxied?: boolean },
  existing: CfDnsRecord[],
): Promise<CfResult<{ action: 'unchanged' | 'created' | 'updated'; record: CfDnsRecord }>> {
  const type = expected.type.toUpperCase();
  const wantProxied = expected.proxied ?? false;

  // Check for exact match including proxied state
  const match = existing.find(
    (r) =>
      r.type.toUpperCase() === type &&
      r.name.toLowerCase() === expected.name.toLowerCase() &&
      dnsRecordsMatch(r, expected) &&
      (r.proxied ?? false) === wantProxied,
  );
  if (match) {
    return { ok: true, data: { action: 'unchanged', record: match } };
  }

  const sameNameType = existing.filter(
    (r) => r.type.toUpperCase() === type && r.name.toLowerCase() === expected.name.toLowerCase(),
  );

  const body: Record<string, unknown> = {
    type,
    name: expected.name,
    content: expected.content,
    ttl: wantProxied ? 1 : (expected.ttl ?? 1), // proxied records must use ttl=1 (auto)
    proxied: wantProxied,
  };
  if (type === 'MX' && expected.priority != null) {
    body.priority = expected.priority;
  }

  if (sameNameType.length === 1 && type !== 'MX') {
    if (type === 'TXT') {
      const existingKind = txtRecordKind(sameNameType[0].content);
      const wantedKind = txtRecordKind(expected.content);
      const replaceable =
        existingKind === wantedKind || (existingKind === 'unknown' && wantedKind === 'unknown');
      if (replaceable) {
        const out = await patchDnsRecord(zoneId, sameNameType[0].id, body);
        if (!out.ok) return out;
        return { ok: true, data: out.data };
      }
      // Different TXT kinds at the same name (SPF vs verification) — add another record.
    } else {
      const out = await patchDnsRecord(zoneId, sameNameType[0].id, body);
      if (!out.ok) return out;
      return { ok: true, data: out.data };
    }
  }

  if (sameNameType.length > 1) {
    if (type === 'TXT') {
      const pick = pickTxtRecordForUpsert(sameNameType, expected.content);
      if (pick.action === 'error') return { ok: false, error: pick.error };
      if (pick.action === 'update') {
        const out = await patchDnsRecord(zoneId, pick.record.id, body);
        if (!out.ok) return out;
        return { ok: true, data: out.data };
      }
      // No matching SPF/DMARC TXT yet — add another TXT record at this name (valid in DNS).
    } else if (type !== 'MX') {
      return {
        ok: false,
        error: `Multiple ${type} records for ${expected.name}; resolve manually in Cloudflare`,
      };
    }
    // MX: several hosts at the same name are normal (Google Workspace has five).
    // Fall through and POST the missing target instead of replacing an existing one.
  }

  const out = await cfFetch<CfDnsRecord>(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!out.ok) return out;
  return { ok: true, data: { action: 'created', record: out.data } };
}

/** Delete a DNS record by ID. */
export async function cloudflareDeleteDnsRecord(
  zoneId: string,
  recordId: string,
): Promise<CfResult<{ id: string }>> {
  return cfFetch<{ id: string }>(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'DELETE',
  });
}

/**
 * Disable Cloudflare Email Routing so Google (or other) MX records can take over.
 * No-ops when routing is already off or the zone never enabled it.
 */
export async function cloudflareDisableEmailRouting(
  zoneId: string,
): Promise<CfResult<{ disabled: boolean; detail: string }>> {
  const current = await cfFetch<{ enabled?: boolean; name?: string }>(
    `/zones/${zoneId}/email/routing`,
  );
  if (!current.ok) {
    // Zone without the Email Routing product returns 404 — treat as already off.
    if (current.status === 404) {
      return { ok: true, data: { disabled: false, detail: 'Email Routing is not configured on this zone.' } };
    }
    return current;
  }
  if (!current.data?.enabled) {
    return { ok: true, data: { disabled: false, detail: 'Email Routing is already off.' } };
  }
  const disabled = await cfFetch<{ enabled?: boolean }>(`/zones/${zoneId}/email/routing/disable`, {
    method: 'POST',
  });
  if (!disabled.ok) return disabled;
  return { ok: true, data: { disabled: true, detail: 'Disabled Cloudflare Email Routing so Google MX can be authoritative.' } };
}

/** Read one zone setting (e.g. ssl). */
export async function cloudflareGetZoneSetting(
  zoneId: string,
  settingId: string,
): Promise<CfResult<{ id: string; value: unknown; modified_on?: string }>> {
  return cfFetch(`/zones/${zoneId}/settings/${settingId}`);
}

/** Write one zone setting (e.g. ssl → "flexible"). */
export async function cloudflareSetZoneSetting(
  zoneId: string,
  settingId: string,
  value: unknown,
): Promise<CfResult<{ id: string; value: unknown }>> {
  return cfFetch(`/zones/${zoneId}/settings/${settingId}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  });
}

export type CfSslMode = 'off' | 'flexible' | 'full' | 'strict';

export async function cloudflareGetSslMode(
  zoneId: string,
): Promise<CfResult<{ id: string; value: CfSslMode; modified_on?: string }>> {
  const out = await cloudflareGetZoneSetting(zoneId, 'ssl');
  if (!out.ok) return out;
  return { ok: true, data: { ...out.data, value: out.data.value as CfSslMode } };
}

export async function cloudflareSetSslMode(
  zoneId: string,
  mode: CfSslMode,
): Promise<CfResult<{ id: string; value: CfSslMode }>> {
  const out = await cloudflareSetZoneSetting(zoneId, 'ssl', mode);
  if (!out.ok) return out;
  return { ok: true, data: { ...out.data, value: out.data.value as CfSslMode } };
}

// ---------------------------------------------------------------------------
// Redirect Rules (Rulesets API)
// https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/
// ---------------------------------------------------------------------------

export type CfRedirectRule = {
  id?: string;
  description?: string;
  expression: string;
  action: 'redirect';
  action_parameters: {
    from_value: {
      status_code: number;
      target_url: { expression: string };
      preserve_query_string: boolean;
    };
  };
  enabled?: boolean;
};

export type CfRuleset = {
  id: string;
  phase: string;
  rules: CfRedirectRule[];
};

/**
 * Upsert a dynamic redirect rule in the zone's
 * http_request_dynamic_redirect phase ruleset.
 *
 * Creates the ruleset if it doesn't exist yet, otherwise appends/replaces
 * a rule with the same description.
 */
export async function cloudflareUpsertRedirectRule(
  zoneId: string,
  rule: {
    description: string;
    expression: string;       // e.g. 'http.host eq "www.example.com"'
    target_expression: string; // e.g. 'concat("https://example.com", http.request.uri.path)'
    status_code?: number;      // default 301
    preserve_query_string?: boolean; // default true
  },
): Promise<CfResult<{ action: 'created' | 'updated'; ruleset_id: string; rule_id: string }>> {
  const phase = 'http_request_dynamic_redirect';

  // Phase entrypoint — listing ?phase= can return a stale/non-zone ruleset id.
  const entryOut = await cfFetch<CfRuleset>(`/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
  let rulesetId: string | undefined;
  let existingRules: CfRedirectRule[] = [];

  if (entryOut.ok) {
    rulesetId = entryOut.data.id;
    existingRules = entryOut.data.rules ?? [];
  } else if (entryOut.status !== 404) {
    return entryOut;
  }

  if (!rulesetId) {
    const createOut = await cfFetch<CfRuleset>(`/zones/${zoneId}/rulesets`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Redirect rules ruleset', kind: 'zone', phase, rules: [] }),
    });
    if (!createOut.ok) return createOut;
    rulesetId = createOut.data.id;
    existingRules = [];
  }

  // 2. Build the new/replacement rule
  const newRule: CfRedirectRule = {
    description: rule.description,
    expression: rule.expression,
    action: 'redirect',
    action_parameters: {
      from_value: {
        status_code: rule.status_code ?? 301,
        target_url: { expression: rule.target_expression },
        preserve_query_string: rule.preserve_query_string ?? true,
      },
    },
    enabled: true,
  };

  // 3. Replace existing rule with same description, or append
  const existingIndex = existingRules.findIndex(
    (r) => r.description === rule.description,
  );
  const wasUpdate = existingIndex !== -1;
  const existingRuleId = wasUpdate ? existingRules[existingIndex].id : undefined;

  const updatedRules: CfRedirectRule[] = wasUpdate
    ? existingRules.map((r, i) => (i === existingIndex ? { ...newRule, id: existingRuleId } : r))
    : [...existingRules, newRule];

  const putOut = await cfFetch<CfRuleset>(`/zones/${zoneId}/rulesets/${rulesetId}`, {
    method: 'PUT',
    body: JSON.stringify({ rules: updatedRules }),
  });
  if (!putOut.ok) return putOut;

  const savedRule = putOut.data.rules.find((r) => r.description === rule.description);

  return {
    ok: true,
    data: {
      action: wasUpdate ? 'updated' : 'created',
      ruleset_id: rulesetId,
      rule_id: savedRule?.id ?? '',
    },
  };
}

/**
 * Browsers accept `https://example.com.` (FQDN). Cloudflare strips that trailing
 * dot from `http.host`, so Single Redirects never match. A Snippet can still
 * read the raw Host header and 301 — same as google.com. / github.com.
 */
export const FQDN_TRAILING_DOT_SNIPPET_NAME = 'fqdn_trailing_dot';
export const FQDN_TRAILING_DOT_REDIRECT_DESCRIPTION = 'Redirect FQDN trailing-dot host';

const FQDN_TRAILING_DOT_SNIPPET = `export default {
  async fetch(request) {
    const host = request.headers.get("host") || "";
    const hostname = host.split(":")[0];
    if (!hostname.endsWith(".")) return fetch(request);
    const url = new URL(request.url);
    url.hostname = hostname.replace(/\\.+$/, "");
    url.protocol = "https:";
    return Response.redirect(url.toString(), 301);
  }
};
`;

type CfSnippetRule = {
  description?: string;
  enabled?: boolean;
  expression: string;
  snippet_name: string;
};

async function cfUploadSnippet(
  zoneId: string,
  snippetName: string,
  filename: string,
  source: string,
): Promise<CfResult<{ snippet_name: string }>> {
  const apiToken = token();
  if (!apiToken) return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };

  const form = new FormData();
  form.append('files', new Blob([source], { type: 'application/javascript+module' }), filename);
  form.append('metadata', JSON.stringify({ main_module: filename }));

  const res = await fetch(`${CF_API}/zones/${zoneId}/snippets/${snippetName}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiToken}` },
    body: form,
  });
  const raw = await res.text();
  let body: { success?: boolean; errors?: { message: string }[]; result?: { snippet_name: string } };
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, error: 'Invalid JSON from Cloudflare', status: res.status };
  }
  if (!res.ok || body.success === false) {
    const msg = body.errors?.map((e) => e.message).join('; ') || `HTTP ${res.status}`;
    return { ok: false, error: msg, status: res.status };
  }
  return { ok: true, data: body.result ?? { snippet_name: snippetName } };
}

export async function ensureFqdnTrailingDotRedirect(
  zoneId: string,
): Promise<CfResult<{ action: 'created' | 'updated'; snippet_name?: string; ruleset_id?: string; rule_id?: string }>> {
  // Prefer a Snippet (sees the raw Host). Paid-plan / token may reject it.
  const uploaded = await cfUploadSnippet(zoneId, FQDN_TRAILING_DOT_SNIPPET_NAME, 'main.js', FQDN_TRAILING_DOT_SNIPPET);
  if (uploaded.ok) {
    const listed = await cfFetch<{ rules?: CfSnippetRule[] } | CfSnippetRule[]>(
      `/zones/${zoneId}/snippets/snippet_rules`,
    );
    if (listed.ok) {
      const existing = Array.isArray(listed.data) ? listed.data : listed.data.rules ?? [];
      const rule: CfSnippetRule = {
        description: FQDN_TRAILING_DOT_REDIRECT_DESCRIPTION,
        enabled: true,
        expression: 'true',
        snippet_name: FQDN_TRAILING_DOT_SNIPPET_NAME,
      };
      const without = existing.filter((r) => r.snippet_name !== FQDN_TRAILING_DOT_SNIPPET_NAME);
      const wasUpdate = without.length !== existing.length;
      const putOut = await cfFetch<{ rules?: CfSnippetRule[] }>(`/zones/${zoneId}/snippets/snippet_rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules: [...without, rule] }),
      });
      if (putOut.ok) {
        return {
          ok: true,
          data: { action: wasUpdate ? 'updated' : 'created', snippet_name: FQDN_TRAILING_DOT_SNIPPET_NAME },
        };
      }
    }
  }

  // Single Redirects: http.host is normalized, but the raw Host header still has the dot.
  return cloudflareUpsertRedirectRule(zoneId, {
    description: FQDN_TRAILING_DOT_REDIRECT_DESCRIPTION,
    expression: 'ends_with(http.request.headers["host"][0], ".")',
    target_expression:
      'concat("https://", wildcard_replace(http.request.headers["host"][0], "*.", "${1}"), http.request.uri.path)',
    status_code: 301,
    preserve_query_string: true,
  });
}

export async function cloudflareVerifyToken(): Promise<CfResult<{ id: string; status: string }>> {
  const userVerify = await cfFetch<{ id: string; status: string }>('/user/tokens/verify');
  if (userVerify.ok) return userVerify;

  // Account-scoped tokens (cfat_*) fail /user/tokens/verify — probe /accounts instead.
  const accounts = await cfFetch<{ id: string; name: string }[]>('/accounts?per_page=1');
  if (accounts.ok && accounts.data.length > 0) {
    return { ok: true, data: { id: accounts.data[0].id, status: 'active (account token)' } };
  }

  return {
    ok: false,
    error:
      userVerify.error ||
      (accounts.ok ? 'Cloudflare token could not be verified' : accounts.error),
  };
}

// ---------------------------------------------------------------------------
// Zone creation
// ---------------------------------------------------------------------------

export type CfZone = {
  id: string;
  name: string;
  status: string;
  name_servers: string[];
  original_name_servers?: string[];
};

/**
 * Create a new Cloudflare zone (add a domain to the account).
 * Returns the zone id and the assigned Cloudflare nameservers.
 * Requires the token to have Zone → Zone → Edit on the account.
 */
export async function cloudflareCreateZone(
  domain: string,
  opts?: { jump_start?: boolean; account_id?: string },
): Promise<CfResult<CfZone>> {
  const verify = await cloudflareVerifyToken();
  if (!verify.ok) {
    return {
      ok: false,
      error: `Cloudflare token invalid — cannot create zone (${verify.error})`,
    };
  }

  // We need an account id to create a zone
  let accountId = opts?.account_id;
  if (!accountId) {
    const accounts = await cfFetch<{ id: string; name: string }[]>('/accounts?per_page=1');
    if (!accounts.ok || accounts.data.length === 0) {
      return {
        ok: false,
        error: 'Could not resolve Cloudflare account id — pass account_id explicitly or ensure token has Account → Account Settings → Read',
      };
    }
    accountId = accounts.data[0].id;
  }

  const body: Record<string, unknown> = {
    name: domain.toLowerCase().replace(/\.$/, ''),
    account: { id: accountId },
    jump_start: opts?.jump_start ?? true,
  };

  const out = await cfFetch<CfZone>('/zones', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return out;
}
