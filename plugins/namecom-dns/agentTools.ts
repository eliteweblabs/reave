/**
 * Name.com DNS agent tools.
 *
 * Credentials are passed per-call (username + token) so each client's
 * Name.com account can be managed independently using vault-stored tokens.
 * Falls back to NAMECOM_USERNAME / NAMECOM_TOKEN env vars when omitted.
 */
import {
  isNamecomConfigured,
  namecomListRecords,
  namecomCreateRecord,
  namecomDeleteRecord,
  namecomUpdateRecord,
  namecomListDomains,
  namecomPing,
  formatNamecomRecords,
  resolveNamecomCredentials,
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
    namecom_ping: handle_namecom_ping,
    namecom_list_domains: handle_namecom_list_domains,
    namecom_list_records: handle_namecom_list_records,
    namecom_create_record: handle_namecom_create_record,
    namecom_delete_record: handle_namecom_delete_record,
    namecom_update_record: handle_namecom_update_record,
  },
};
