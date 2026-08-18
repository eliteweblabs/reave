/**
 * General Cloudflare DNS management (any zone the token can access).
 * Resend-specific sync stays in resendDnsSync.ts.
 */
import {
  cloudflareDeleteDnsRecord,
  cloudflareFindZone,
  cloudflareGetSslMode,
  cloudflareGetZoneSetting,
  cloudflareListDnsRecords,
  cloudflareSetSslMode,
  cloudflareSetZoneSetting,
  cloudflareUpsertDnsRecord,
  cloudflareVerifyToken,
  cloudflareZoneName,
  dnsRecordsMatch,
  fqdnRecordName,
  isCloudflareConfigured,
  type CfDnsRecord,
  type CfSslMode,
} from './cloudflareClient.ts';

export type CloudflareDnsAction =
  | 'verify'
  | 'list_records'
  | 'upsert_record'
  | 'delete_record'
  | 'get_ssl_mode'
  | 'set_ssl_mode'
  | 'create_redirect_rule';

export type CloudflareDnsActionResult =
  | {
      ok: true;
      action: CloudflareDnsAction;
      domain: string;
      zone: { id: string; name: string };
      summary: string;
      records?: CfDnsRecord[];
      upsert?: { action: 'unchanged' | 'created' | 'updated'; record: CfDnsRecord };
      deleted?: CfDnsRecord;
      ssl_mode?: CfSslMode;
      previous_ssl_mode?: CfSslMode;
      redirect_rule?: unknown;
    }
  | { ok: false; error: string; hint?: string };

export type CloudflareZoneSettingResult =
  | { ok: true; action: 'get_zone_setting' | 'set_zone_setting'; setting: string; value: unknown; summary: string }
  | { ok: false; error: string; hint?: string };

const SSL_MODES: CfSslMode[] = ['off', 'flexible', 'full', 'strict'];

function sslModeLabel(mode: CfSslMode): string {
  if (mode === 'strict') return 'Full (strict)';
  if (mode === 'full') return 'Full';
  if (mode === 'flexible') return 'Flexible';
  return 'Off';
}

function zoneFqdn(zone: string, recordName: string): string {
  const rel = recordName.trim().toLowerCase();
  if (!rel || rel === '@') return cloudflareZoneName(zone);
  return fqdnRecordName(cloudflareZoneName(zone), rel);
}

export function isCloudflareDnsManageConfigured(): boolean {
  return isCloudflareConfigured();
}

/** Call the Cloudflare Rulesets API to upsert a dynamic redirect rule. */
async function cloudflareUpsertRedirectRule(
  zoneId: string,
  token: string,
  opts: {
    hostname: string;   // e.g. www.thebarbersedge.com
    redirect_expression: string; // e.g. concat("https://thebarbersedge.com", http.request.uri.path)
    status_code?: 301 | 302;
    preserve_query_string?: boolean;
    description?: string;
  },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const phase = 'http_request_dynamic_redirect';
  const baseUrl = 'https://api.cloudflare.com/client/v4';
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 1. Get or create the phase ruleset entry point
  const getRuleset = await fetch(`${baseUrl}/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`, { headers });
  let rulesetId: string | null = null;
  let existingRules: unknown[] = [];

  if (getRuleset.ok) {
    const body = (await getRuleset.json()) as { result?: { id?: string; rules?: unknown[] } };
    rulesetId = body.result?.id ?? null;
    existingRules = body.result?.rules ?? [];
  }

  const matchExpression = `http.host eq "${opts.hostname}"`;
  const description = opts.description ?? `Redirect ${opts.hostname} → apex`;

  const newRule = {
    action: 'redirect',
    expression: matchExpression,
    description,
    enabled: true,
    action_parameters: {
      from_value: {
        status_code: opts.status_code ?? 301,
        target_url: {
          expression: opts.redirect_expression,
        },
        preserve_query_string: opts.preserve_query_string ?? true,
      },
    },
  };

  // Remove any existing rule matching the same hostname expression to avoid duplicates
  const filteredRules = (existingRules as Array<{ expression?: string }>).filter(
    (r) => r.expression !== matchExpression,
  );
  const rules = [...filteredRules, newRule];

  let res: Response;
  if (rulesetId) {
    // PUT to replace the ruleset rules
    res = await fetch(`${baseUrl}/zones/${zoneId}/rulesets/${rulesetId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ rules }),
    });
  } else {
    // POST to create the phase entrypoint
    res = await fetch(`${baseUrl}/zones/${zoneId}/rulesets`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'zone', phase, name: 'default', rules }),
    });
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const j = (await res.json()) as { errors?: Array<{ message: string }> };
      if (j.errors?.length) msg = j.errors.map((e) => e.message).join('; ');
    } catch {}
    return { ok: false, error: `Cloudflare Rulesets API: ${msg}` };
  }

  const result = await res.json();
  return { ok: true, data: result };
}

export async function cloudflareDnsManage(input: {
  action: CloudflareDnsAction;
  domain: string;
  type?: string;
  name?: string;
  content?: string;
  priority?: number;
  record_id?: string;
  ssl_mode?: string;
  proxied?: boolean;
  // redirect rule fields
  redirect_hostname?: string;
  redirect_expression?: string;
  redirect_status_code?: 301 | 302;
  preserve_query_string?: boolean;
  redirect_description?: string;
}): Promise<CloudflareDnsActionResult> {
  const domain = input.domain.trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return { ok: false, error: 'domain is required' };

  if (!isCloudflareConfigured()) {
    return {
      ok: false,
      error: 'CLOUDFLARE_API_TOKEN is not set on this service',
      hint: 'Set CLOUDFLARE_API_TOKEN on Railway with Zone → DNS → Read/Edit and Zone → Zone Settings → Read/Edit on the zones you manage.',
    };
  }

  const zoneName = cloudflareZoneName(domain);
  const zone = await cloudflareFindZone(zoneName);
  if (!zone.ok) {
    return {
      ok: false,
      error: zone.error,
      hint:
        'Call run_dev_task ping_cloudflare first. If the token is valid but the zone is missing, the domain may not be in this Cloudflare account or the token lacks access to that zone.',
    };
  }

  if (input.action === 'verify') {
    const token = await cloudflareVerifyToken();
    if (!token.ok) {
      return { ok: false, error: token.error, hint: 'Regenerate CLOUDFLARE_API_TOKEN and update Railway.' };
    }
    return {
      ok: true,
      action: 'verify',
      domain,
      zone: zone.data,
      summary: `Cloudflare token active (${token.data.status}). Zone ${zone.data.name} (${zone.data.id}) is reachable with this token.`,
    };
  }

  if (input.action === 'list_records') {
    const records = await cloudflareListDnsRecords(zone.data.id, {
      type: input.type?.trim() || undefined,
    });
    if (!records.ok) return { ok: false, error: records.error };
    const lines = records.data.map((r) => {
      const pri = r.priority != null ? ` pri ${r.priority}` : '';
      const proxied = r.proxied ? ' proxied' : '';
      return `${r.id}  ${r.type.padEnd(6)} ${r.name}${pri}${proxied}\n       ${r.content.slice(0, 160)}${r.content.length > 160 ? '…' : ''}`;
    });
    return {
      ok: true,
      action: 'list_records',
      domain,
      zone: zone.data,
      records: records.data,
      summary: lines.length
        ? `DNS records in Cloudflare zone ${zone.data.name} (${records.data.length}):\n${lines.join('\n')}`
        : `No DNS records found in Cloudflare zone ${zone.data.name}.`,
    };
  }

  if (input.action === 'get_ssl_mode') {
    const ssl = await cloudflareGetSslMode(zone.data.id);
    if (!ssl.ok) {
      return {
        ok: false,
        error: ssl.error,
        hint: 'Token may need Zone → Zone Settings → Read. Regenerate CLOUDFLARE_API_TOKEN with Zone Settings read/edit on this zone.',
      };
    }
    const mode = ssl.data.value;
    return {
      ok: true,
      action: 'get_ssl_mode',
      domain,
      zone: zone.data,
      ssl_mode: mode,
      summary: `Cloudflare SSL/TLS encryption mode for ${zone.data.name}: ${sslModeLabel(mode)} (${mode}).`,
    };
  }

  if (input.action === 'set_ssl_mode') {
    const modeRaw = String(input.ssl_mode ?? '').trim().toLowerCase();
    if (!SSL_MODES.includes(modeRaw as CfSslMode)) {
      return {
        ok: false,
        error: `ssl_mode must be one of: ${SSL_MODES.join(', ')}`,
      };
    }
    const mode = modeRaw as CfSslMode;
    const previous = await cloudflareGetSslMode(zone.data.id);
    const prevMode = previous.ok ? previous.data.value : undefined;
    const ssl = await cloudflareSetSslMode(zone.data.id, mode);
    if (!ssl.ok) {
      return {
        ok: false,
        error: ssl.error,
        hint: 'Token may need Zone → Zone Settings → Edit. Regenerate CLOUDFLARE_API_TOKEN with Zone Settings edit on this zone.',
      };
    }
    const changed =
      prevMode && prevMode !== mode
        ? `Changed from ${sslModeLabel(prevMode)} (${prevMode}) to ${sslModeLabel(mode)} (${mode}).`
        : `Set to ${sslModeLabel(mode)} (${mode}).`;
    return {
      ok: true,
      action: 'set_ssl_mode',
      domain,
      zone: zone.data,
      ssl_mode: ssl.data.value,
      previous_ssl_mode: prevMode,
      summary: `Cloudflare SSL/TLS encryption mode for ${zone.data.name}: ${changed} Propagation can take a few minutes.`,
    };
  }

  if (input.action === 'create_redirect_rule') {
    const hostname = (input.redirect_hostname ?? '').trim();
    const expression = (input.redirect_expression ?? '').trim();
    if (!hostname) return { ok: false, error: 'redirect_hostname is required (e.g. www.thebarbersedge.com)' };
    if (!expression) return { ok: false, error: 'redirect_expression is required (e.g. concat("https://thebarbersedge.com", http.request.uri.path))' };

    const apiToken = process.env.CLOUDFLARE_API_TOKEN ?? '';
    if (!apiToken) return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set' };

    const result = await cloudflareUpsertRedirectRule(zone.data.id, apiToken, {
      hostname,
      redirect_expression: expression,
      status_code: input.redirect_status_code ?? 301,
      preserve_query_string: input.preserve_query_string ?? true,
      description: input.redirect_description,
    });
    if (!result.ok) return { ok: false, error: result.error };

    return {
      ok: true,
      action: 'create_redirect_rule',
      domain,
      zone: zone.data,
      redirect_rule: result.data,
      summary: `Redirect rule created: ${hostname} → ${expression} (${input.redirect_status_code ?? 301}, preserve_query_string=${input.preserve_query_string ?? true}).`,
    };
  }

  if (input.action === 'delete_record') {
    const recordId = String(input.record_id ?? '').trim();
    if (recordId) {
      const existing = await cloudflareListDnsRecords(zone.data.id);
      if (!existing.ok) return { ok: false, error: existing.error };
      const match = existing.data.find((r) => r.id === recordId);
      if (!match) {
        return {
          ok: false,
          error: `No DNS record with id ${recordId} in zone ${zone.data.name}. Call list_records first.`,
        };
      }
      const del = await cloudflareDeleteDnsRecord(zone.data.id, recordId);
      if (!del.ok) return { ok: false, error: del.error };
      return {
        ok: true,
        action: 'delete_record',
        domain,
        zone: zone.data,
        deleted: match,
        summary: `DELETED ${match.type} ${match.name}\n       ${match.content.slice(0, 160)}${match.content.length > 160 ? '…' : ''}`,
      };
    }

    const type = String(input.type ?? '').trim().toUpperCase();
    const nameArg = String(input.name ?? '').trim();
    const content = String(input.content ?? '').trim();
    if (!type) return { ok: false, error: 'type is required for delete_record when record_id is omitted' };
    if (!nameArg) return { ok: false, error: 'name is required for delete_record when record_id is omitted' };

    const fqdn = zoneFqdn(domain, nameArg);
    const existing = await cloudflareListDnsRecords(zone.data.id, { name: fqdn, type });
    if (!existing.ok) return { ok: false, error: existing.error };
    let candidates = existing.data;
    if (content) {
      candidates = candidates.filter((r) =>
        dnsRecordsMatch(r, { type, content, priority: input.priority }),
      );
    }
    if (candidates.length === 0) {
      return {
        ok: false,
        error: `No matching ${type} record at ${fqdn}${content ? ` with that content` : ''}. Call list_records first.`,
      };
    }
    if (candidates.length > 1) {
      return {
        ok: false,
        error: `Multiple ${type} records at ${fqdn}; pass record_id from list_records or include content to disambiguate.`,
        hint: candidates.map((r) => `${r.id}: ${r.content.slice(0, 80)}`).join('; '),
      };
    }

    const match = candidates[0];
    const del = await cloudflareDeleteDnsRecord(zone.data.id, match.id);
    if (!del.ok) return { ok: false, error: del.error };
    return {
      ok: true,
      action: 'delete_record',
      domain,
      zone: zone.data,
      deleted: match,
      summary: `DELETED ${match.type} ${match.name}\n       ${match.content.slice(0, 160)}${match.content.length > 160 ? '…' : ''}`,
    };
  }

  // upsert_record
  const type = String(input.type ?? '').trim().toUpperCase();
  const nameArg = String(input.name ?? '@').trim();
  const content = String(input.content ?? '').trim();
  if (!type) return { ok: false, error: 'type is required for upsert_record (e.g. TXT, MX, CNAME)' };
  if (!content) return { ok: false, error: 'content is required for upsert_record' };

  const fqdn = zoneFqdn(domain, nameArg);
  const existing = await cloudflareListDnsRecords(zone.data.id, { name: fqdn, type });
  if (!existing.ok) return { ok: false, error: existing.error };

  const upsert = await cloudflareUpsertDnsRecord(
    zone.data.id,
    {
      type,
      name: fqdn,
      content,
      priority: input.priority,
      ttl: 1,
      proxied: input.proxied ?? false,
    },
    existing.data,
  );
  if (!upsert.ok) return { ok: false, error: upsert.error };

  return {
    ok: true,
    action: 'upsert_record',
    domain,
    zone: zone.data,
    upsert: upsert.data,
    summary: `${upsert.data.action.toUpperCase()} ${type} ${fqdn}${input.proxied ? ' (proxied)' : ''}\n       ${content.slice(0, 160)}${content.length > 160 ? '…' : ''}`,
  };
}

export async function cloudflareZoneSettingManage(input: {
  action: 'get_zone_setting' | 'set_zone_setting';
  domain: string;
  setting: string;
  value?: unknown;
}): Promise<CloudflareZoneSettingResult> {
  const domain = input.domain.trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return { ok: false, error: 'domain is required' };
  if (!input.setting?.trim()) {
    return { ok: false, error: 'setting is required (e.g. ssl, security_level, always_use_https)' };
  }

  if (!isCloudflareConfigured()) {
    return { ok: false, error: 'CLOUDFLARE_API_TOKEN is not set on this service' };
  }

  const zoneName = cloudflareZoneName(domain);
  const zone = await cloudflareFindZone(zoneName);
  if (!zone.ok) {
    return { ok: false, error: zone.error, hint: 'Domain may not be in this Cloudflare account or token lacks access.' };
  }

  if (input.action === 'get_zone_setting') {
    const res = await cloudflareGetZoneSetting(zone.data.id, input.setting);
    if (!res.ok) return { ok: false, error: res.error };
    return {
      ok: true,
      action: 'get_zone_setting',
      setting: input.setting,
      value: res.data.value,
      summary: `Zone ${zone.data.name} → ${input.setting} = ${JSON.stringify(res.data.value)}`,
    };
  }

  if (input.value === undefined) return { ok: false, error: 'value is required for set_zone_setting' };
  const res = await cloudflareSetZoneSetting(zone.data.id, input.setting, input.value);
  if (!res.ok) return { ok: false, error: res.error };
  return {
    ok: true,
    action: 'set_zone_setting',
    setting: input.setting,
    value: res.data.value,
    summary: `SET zone ${zone.data.name} → ${input.setting} = ${JSON.stringify(res.data.value)}`,
  };
}
