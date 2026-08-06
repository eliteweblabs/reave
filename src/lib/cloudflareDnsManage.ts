/**
 * General Cloudflare DNS management (any zone the token can access).
 * Resend-specific sync stays in resendDnsSync.ts.
 */
import {
  cloudflareFindZone,
  cloudflareListDnsRecords,
  cloudflareUpsertDnsRecord,
  cloudflareDeleteDnsRecord,
  cloudflareGetZoneSetting,
  cloudflareSetZoneSetting,
  cloudflareVerifyToken,
  cloudflareZoneName,
  fqdnRecordName,
  isCloudflareConfigured,
  type CfDnsRecord,
} from './cloudflareClient.ts';

export type CloudflareDnsActionResult =
  | {
      ok: true;
      action: 'verify' | 'list_records' | 'upsert_record' | 'delete_record';
      domain: string;
      zone: { id: string; name: string };
      summary: string;
      records?: CfDnsRecord[];
      upsert?: { action: 'unchanged' | 'created' | 'updated'; record: CfDnsRecord };
      deleted?: { id: string };
    }
  | { ok: false; error: string; hint?: string };

export type CloudflareZoneSettingResult =
  | { ok: true; action: 'get_zone_setting' | 'set_zone_setting'; setting: string; value: unknown; summary: string }
  | { ok: false; error: string; hint?: string };

function zoneFqdn(zone: string, recordName: string): string {
  const rel = recordName.trim().toLowerCase();
  if (!rel || rel === '@') return cloudflareZoneName(zone);
  return fqdnRecordName(cloudflareZoneName(zone), rel);
}

export function isCloudflareDnsManageConfigured(): boolean {
  return isCloudflareConfigured();
}

export async function cloudflareDnsManage(input: {
  action: 'verify' | 'list_records' | 'upsert_record' | 'delete_record';
  domain: string;
  type?: string;
  name?: string;
  content?: string;
  priority?: number;
  record_id?: string;
}): Promise<CloudflareDnsActionResult> {
  const domain = input.domain.trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return { ok: false, error: 'domain is required' };

  if (!isCloudflareConfigured()) {
    return {
      ok: false,
      error: 'CLOUDFLARE_API_TOKEN is not set on this service',
      hint: 'Set CLOUDFLARE_API_TOKEN on Railway with Zone → DNS → Read/Edit on the zones you manage.',
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
      return `${r.type.padEnd(6)} ${r.name}${pri}${proxied}\n       ${r.content.slice(0, 160)}${r.content.length > 160 ? '…' : ''}`;
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

  if (input.action === 'delete_record') {
    const recordId = input.record_id?.trim();
    if (!recordId) return { ok: false, error: 'record_id is required for delete_record — call list_records first to find the id' };
    const del = await cloudflareDeleteDnsRecord(zone.data.id, recordId);
    if (!del.ok) return { ok: false, error: del.error };
    return {
      ok: true,
      action: 'delete_record',
      domain,
      zone: zone.data,
      deleted: del.data,
      summary: `DELETED DNS record ${recordId} from zone ${zone.data.name}.`,
    };
  }

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
    summary: `${upsert.data.action.toUpperCase()} ${type} ${fqdn}\n       ${content.slice(0, 160)}${content.length > 160 ? '…' : ''}`,
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
  if (!input.setting?.trim()) return { ok: false, error: 'setting is required (e.g. ssl, security_level, always_use_https)' };

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
