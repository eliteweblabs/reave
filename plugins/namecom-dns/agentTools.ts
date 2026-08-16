/**
 * Name.com DNS agent tools.
 *
 * Credentials are passed per-call (username + token) so each client's
 * Name.com account can be managed independently using vault-stored tokens.
 * Falls back to NAMECOM_USERNAME / NAMECOM_TOKEN env vars when omitted.
 */
import {
  isNamecomHostedDns,
  namecomListRecords,
  namecomCreateRecord,
  namecomDeleteRecord,
  namecomUpdateRecord,
  namecomListDomains,
  namecomGetDomain,
  namecomSetNameservers,
  namecomPing,
  formatNamecomRecords,
  resolveNamecomCredentials,
  type NamecomCredentials,
  type NamecomRecord,
} from '../../src/lib/namecomClient';
import { hasFeature } from '../../src/lib/features';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function credentialsFromArgs(args: Record<string, unknown>) {
  return resolveNamecomCredentials({
    username: typeof args.username === 'string' ? args.username : undefined,
    token: typeof args.token === 'string' ? args.token : undefined,
  });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handle_namecom_ping(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.' });
  const out = await namecomPing(creds);
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  return JSON.stringify({ ok: true, username: out.data.username, message: 'Name.com credentials are valid.' });
}

async function handle_namecom_list_domains(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.' });
  const out = await namecomListDomains(creds);
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  return JSON.stringify({ ok: true, count: out.data.length, domains: out.data });
}

async function handle_namecom_list_records(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.' });
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });

  const out = await namecomListRecords(domain, creds);
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  return JSON.stringify({
    ok: true,
    domain,
    count: out.data.length,
    summary: formatNamecomRecords(out.data),
    records: out.data,
  });
}

async function handle_namecom_create_record(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.' });
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });
  const type = String(args.type ?? '').trim().toUpperCase();
  if (!type) return JSON.stringify({ error: 'type is required (A, CNAME, TXT, MX, etc.)' });
  const answer = String(args.answer ?? '').trim();
  if (!answer) return JSON.stringify({ error: 'answer is required' });

  const out = await namecomCreateRecord(
    domain,
    {
      host: typeof args.host === 'string' ? args.host.trim() : '',
      type,
      answer,
      ttl: typeof args.ttl === 'number' ? args.ttl : 300,
      priority: typeof args.priority === 'number' ? args.priority : undefined,
    },
    creds,
  );
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  return JSON.stringify({ ok: true, record: out.data });
}

async function handle_namecom_delete_record(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.' });
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });
  const recordId = typeof args.record_id === 'number' ? args.record_id : parseInt(String(args.record_id ?? ''), 10);
  if (!recordId || isNaN(recordId)) return JSON.stringify({ error: 'record_id (integer) is required — use namecom_list_records to find it' });

  const out = await namecomDeleteRecord(domain, recordId, creds);
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  return JSON.stringify({ ok: true, deleted: true, record_id: recordId, domain });
}

async function handle_namecom_update_record(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.' });
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });
  const recordId = typeof args.record_id === 'number' ? args.record_id : parseInt(String(args.record_id ?? ''), 10);
  if (!recordId || isNaN(recordId)) return JSON.stringify({ error: 'record_id (integer) is required — use namecom_list_records to find it' });
  const type = String(args.type ?? '').trim().toUpperCase();
  if (!type) return JSON.stringify({ error: 'type is required' });
  const answer = String(args.answer ?? '').trim();
  if (!answer) return JSON.stringify({ error: 'answer is required' });

  const out = await namecomUpdateRecord(
    domain,
    recordId,
    {
      host: typeof args.host === 'string' ? args.host.trim() : '',
      type,
      answer,
      ttl: typeof args.ttl === 'number' ? args.ttl : 300,
      priority: typeof args.priority === 'number' ? args.priority : undefined,
    },
    creds,
  );
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  return JSON.stringify({ ok: true, record: out.data });
}

function parseNameservers(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((n) => String(n).trim().replace(/\.$/, '')).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[\s,;]+/)
      .map((n) => n.trim().replace(/\.$/, ''))
      .filter(Boolean);
  }
  return [];
}

function normalizeHost(host: unknown): string {
  const h = typeof host === 'string' ? host.trim() : '';
  return h === '@' ? '' : h;
}

function recordsMatch(
  record: NamecomRecord,
  host: string,
  type: string,
  answer?: string,
): boolean {
  if (record.type.toUpperCase() !== type) return false;
  const recHost = (record.host || '').replace(/\.$/, '');
  if (recHost !== host) return false;
  if (!answer) return true;
  const a = answer.trim();
  const existing = record.answer.trim();
  if (type === 'TXT' && a.startsWith('v=spf1')) return existing.startsWith('v=spf1');
  if (type === 'TXT' && a.startsWith('v=DMARC1')) return existing.startsWith('v=DMARC1');
  return existing === a;
}

async function handle_namecom_dns(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const creds = credentialsFromArgs(args);
  if (!creds) {
    return JSON.stringify({
      error: 'Name.com credentials not provided and NAMECOM_USERNAME/NAMECOM_TOKEN not set.',
      hint: 'Pass username + token from the client vault, or set NAMECOM_USERNAME / NAMECOM_TOKEN on this service.',
    });
  }

  const action = String(args.action ?? '').trim();
  if (!action) return JSON.stringify({ error: 'action is required' });

  if (action === 'ping') return handle_namecom_ping(args, _ctx);
  if (action === 'list_domains') return handle_namecom_list_domains(args, _ctx);

  const domain = String(args.domain ?? '').trim().toLowerCase().replace(/\.$/, '');
  if (!domain) return JSON.stringify({ error: 'domain is required' });

  if (action === 'get_domain') return formatDomainResult(domain, creds);

  if (action === 'set_nameservers') {
    const nameservers = parseNameservers(args.nameservers);
    if (nameservers.length < 2) {
      return JSON.stringify({
        error: 'nameservers requires at least two hostnames (comma-separated), e.g. ns1.cloudflare.com, ns2.cloudflare.com',
      });
    }
    const out = await namecomSetNameservers(domain, nameservers, creds);
    if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
    const hosted = isNamecomHostedDns(out.data.nameservers);
    return JSON.stringify({
      ok: true,
      action,
      domain,
      nameservers: out.data.nameservers ?? nameservers,
      namecom_hosted_zone: hosted,
      hint: hosted
        ? 'Name.com is hosting DNS — use namecom_dns list_records / upsert_record for zone records.'
        : 'Nameservers are not Name.com. Zone records here will be empty or unused — manage records at the DNS host (usually cloudflare_dns).',
    });
  }

  if (action === 'list_records') {
    const out = await namecomListRecords(domain, creds);
    if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
    const hint =
      out.data.length === 0
        ? 'No zone records. If this domain uses Cloudflare (or other) nameservers, call namecom_dns get_domain then manage records with cloudflare_dns — Name.com zone records only apply when NS is ns*.name.com.'
        : undefined;
    return JSON.stringify({
      ok: true,
      action,
      domain,
      count: out.data.length,
      summary: formatNamecomRecords(out.data),
      records: out.data,
      hint,
    });
  }

  if (action === 'delete_record') {
    return handle_namecom_delete_record(args, _ctx);
  }

  if (action === 'upsert_record') {
    const type = String(args.type ?? '').trim().toUpperCase();
    if (!type) return JSON.stringify({ error: 'type is required for upsert_record (A, CNAME, TXT, MX, …)' });
    const answer = String(args.answer ?? args.content ?? '').trim();
    if (!answer) return JSON.stringify({ error: 'answer is required for upsert_record' });
    const host = normalizeHost(args.host ?? args.name);
    const ttl = typeof args.ttl === 'number' ? args.ttl : 300;
    const priority = typeof args.priority === 'number' ? args.priority : undefined;

    const existing = await namecomListRecords(domain, creds);
    if (!existing.ok) return JSON.stringify({ error: existing.error, status: existing.status });

    const match = existing.data.find((r) => recordsMatch(r, host, type, answer));
    if (match) {
      const same =
        match.answer === answer &&
        (match.ttl ?? 300) === ttl &&
        (priority == null || match.priority === priority);
      if (same) {
        return JSON.stringify({ ok: true, action: 'unchanged', record: match });
      }
      const out = await namecomUpdateRecord(domain, match.id, { host, type, answer, ttl, priority }, creds);
      if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
      return JSON.stringify({ ok: true, action: 'updated', record: out.data });
    }

    const out = await namecomCreateRecord(domain, { host, type, answer, ttl, priority }, creds);
    if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
    return JSON.stringify({ ok: true, action: 'created', record: out.data });
  }

  return JSON.stringify({
    error: `Unknown action "${action}". Use ping, list_domains, get_domain, list_records, upsert_record, delete_record, or set_nameservers.`,
  });
}

async function formatDomainResult(domain: string, creds: NamecomCredentials): Promise<string> {
  const out = await namecomGetDomain(domain, creds);
  if (!out.ok) return JSON.stringify({ error: out.error, status: out.status });
  const hosted = isNamecomHostedDns(out.data.nameservers);
  return JSON.stringify({
    ok: true,
    action: 'get_domain',
    domain: out.data.domainName ?? domain,
    nameservers: out.data.nameservers ?? [],
    expireDate: out.data.expireDate,
    locked: out.data.locked,
    autorenewEnabled: out.data.autorenewEnabled,
    privacyEnabled: out.data.privacyEnabled,
    namecom_hosted_zone: hosted,
    hint: hosted
      ? 'Name.com is hosting DNS — list_records / upsert_record will change the live zone.'
      : 'Nameservers are not Name.com. Zone-record tools only edit unused Name.com copies — use cloudflare_dns (or the actual DNS host) for live records. Use set_nameservers to point the domain back to ns1.name.com / ns2.name.com if you want Name.com to host DNS.',
  });
}

// ---------------------------------------------------------------------------
// Shared credentials parameter schema (reused across all tools)
// ---------------------------------------------------------------------------

const CRED_PROPS = {
  username: {
    type: 'string',
    description: 'Name.com account username (omit to use NAMECOM_USERNAME env or vault token)',
  },
  token: {
    type: 'string',
    description: 'Name.com API token (omit to use NAMECOM_TOKEN env or vault token)',
  },
};

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export const namecomDnsModule: AgentToolModule = {
  id: 'namecomDns',
  enabled: (_ctx) => hasFeature('namecom_dns'),
  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'namecom_dns',
          description:
            'Manage Name.com DNS for a domain you register there — not just zone records. Actions: ping, list_domains, get_domain (nameservers + expiry), list_records, upsert_record, delete_record, set_nameservers. Zone records (A/CNAME/TXT/MX) only affect the live internet when nameservers are still ns*.name.com. If NS is Cloudflare, call get_domain then use cloudflare_dns for records. NEVER say this API can only do zone records — get_domain and set_nameservers are the registrar DNS controls.',
          parameters: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: [
                  'ping',
                  'list_domains',
                  'get_domain',
                  'list_records',
                  'upsert_record',
                  'delete_record',
                  'set_nameservers',
                ],
                description:
                  'ping = credentials; list_domains = account inventory; get_domain = nameservers + lock/expiry; list_records = zone records (ids for delete); upsert_record = create/update one record; delete_record = remove by record_id; set_nameservers = point the domain at Name.com, Cloudflare, or other NS',
              },
              domain: {
                type: 'string',
                description: 'Domain name, e.g. innercityfireprotection.com (required except ping / list_domains)',
              },
              host: {
                type: 'string',
                description: 'Record host — empty or @ for apex, www for subdomain. Alias: name.',
              },
              name: {
                type: 'string',
                description: 'Alias for host (Cloudflare-style).',
              },
              type: {
                type: 'string',
                description: 'Record type for upsert_record / delete_record: A, AAAA, ANAME, CNAME, TXT, MX, NS, SRV',
              },
              answer: {
                type: 'string',
                description: 'Record value for upsert_record. Alias: content.',
              },
              content: {
                type: 'string',
                description: 'Alias for answer (Cloudflare-style).',
              },
              ttl: { type: 'number', description: 'TTL in seconds (default 300, Name.com minimum)' },
              priority: { type: 'number', description: 'MX / SRV priority' },
              record_id: {
                type: 'number',
                description: 'Integer record id from list_records — required for delete_record',
              },
              nameservers: {
                type: 'string',
                description:
                  'Comma-separated nameservers for set_nameservers, e.g. "ns1.cloudflare.com, ns2.cloudflare.com" or "ns1.name.com, ns2.name.com, ns3.name.com, ns4.name.com"',
              },
              ...CRED_PROPS,
            },
            required: ['action'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_ping',
          description:
            'Verify Name.com API credentials are valid. Pass username + token explicitly (from client vault) or omit to use server env vars.',
          parameters: {
            type: 'object',
            properties: { ...CRED_PROPS },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_list_domains',
          description: 'List all domains on a Name.com account.',
          parameters: {
            type: 'object',
            properties: { ...CRED_PROPS },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_list_records',
          description:
            'List all DNS records for a domain at Name.com. Returns record ids needed for delete/update. Always call this before modifying records.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name, e.g. innercityfireprotection.com' },
              ...CRED_PROPS,
            },
            required: ['domain'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_create_record',
          description:
            'Create a new DNS record at Name.com. Use host="" for the apex/root (@). For Railway: type=CNAME, host="", answer="<service>.up.railway.app." For TXT verification: type=TXT, host="_railway-verify", answer="railway-verify=...".',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name, e.g. innercityfireprotection.com' },
              host: {
                type: 'string',
                description: 'Subdomain/host — empty string "" for apex root (@), "www" for www subdomain, "_railway-verify" for TXT, etc.',
              },
              type: {
                type: 'string',
                description: 'Record type: A, CNAME, TXT, MX, AAAA, etc.',
              },
              answer: {
                type: 'string',
                description: 'Record value, e.g. "9r6ap078.up.railway.app." for CNAME, or the TXT string.',
              },
              ttl: {
                type: 'number',
                description: 'TTL in seconds (default 300)',
              },
              priority: {
                type: 'number',
                description: 'Priority — required for MX records.',
              },
              ...CRED_PROPS,
            },
            required: ['domain', 'type', 'answer'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_delete_record',
          description:
            'Delete a DNS record from Name.com by record id. Call namecom_list_records first to find the id. This is destructive — confirm before deleting.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name' },
              record_id: { type: 'number', description: 'Integer record id from namecom_list_records' },
              ...CRED_PROPS,
            },
            required: ['domain', 'record_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_update_record',
          description:
            'Replace a DNS record at Name.com (full update by record id). Use namecom_list_records first to get the id.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name' },
              record_id: { type: 'number', description: 'Integer record id from namecom_list_records' },
              host: { type: 'string', description: 'New host/subdomain (empty = apex)' },
              type: { type: 'string', description: 'Record type' },
              answer: { type: 'string', description: 'New record value' },
              ttl: { type: 'number', description: 'TTL in seconds (default 300)' },
              priority: { type: 'number', description: 'Priority (MX records)' },
              ...CRED_PROPS,
            },
            required: ['domain', 'record_id', 'type', 'answer'],
            additionalProperties: false,
          },
        },
      },
    ];
  },
  handlers: {
    namecom_dns: handle_namecom_dns,
    namecom_ping: handle_namecom_ping,
    namecom_list_domains: handle_namecom_list_domains,
    namecom_list_records: handle_namecom_list_records,
    namecom_create_record: handle_namecom_create_record,
    namecom_delete_record: handle_namecom_delete_record,
    namecom_update_record: handle_namecom_update_record,
  },
};
