/**
 * Agent tool module — Name.com DNS management.
 * Wraps namecomClient.ts for use in the admin chat agent.
 *
 * Credentials come from:
 *  1. Tool args (username + token passed explicitly)
 *  2. NAMECOM_USERNAME / NAMECOM_TOKEN env vars (global fallback)
 *
 * Per-client tokens live in the client vault Data tab — the agent
 * should read them from there and pass as args.
 */
import {
  resolveNamecomCredentials,
  isNamecomConfigured,
  namecomListRecords,
  namecomCreateRecord,
  namecomDeleteRecord,
  namecomUpdateRecord,
  namecomListDomains,
  namecomPing,
  formatNamecomRecords,
} from '../../namecomClient';
import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handle_namecom_list_records(args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });

  const creds = resolveNamecomCredentials({
    username: args.username ? String(args.username) : undefined,
    token: args.token ? String(args.token) : undefined,
  });
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not configured. Pass username+token or set NAMECOM_USERNAME/NAMECOM_TOKEN.' });

  const result = await namecomListRecords(domain, creds);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ domain, records: result.data, formatted: formatNamecomRecords(result.data) });
}

async function handle_namecom_create_record(args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '').trim();
  const host = args.host !== undefined ? String(args.host) : '';
  const type = String(args.type ?? '').trim().toUpperCase();
  const answer = String(args.answer ?? '').trim();
  if (!domain || !type || !answer) return JSON.stringify({ error: 'domain, type, and answer are required' });

  const creds = resolveNamecomCredentials({
    username: args.username ? String(args.username) : undefined,
    token: args.token ? String(args.token) : undefined,
  });
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not configured.' });

  const ttl = args.ttl ? Number(args.ttl) : 300;
  const priority = args.priority !== undefined ? Number(args.priority) : undefined;

  const result = await namecomCreateRecord(domain, { host, type, answer, ttl, priority }, creds);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ ok: true, record: result.data });
}

async function handle_namecom_delete_record(args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '').trim();
  const recordId = args.record_id !== undefined ? Number(args.record_id) : NaN;
  if (!domain || isNaN(recordId)) return JSON.stringify({ error: 'domain and record_id are required' });

  const creds = resolveNamecomCredentials({
    username: args.username ? String(args.username) : undefined,
    token: args.token ? String(args.token) : undefined,
  });
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not configured.' });

  const result = await namecomDeleteRecord(domain, recordId, creds);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ ok: true, deleted_record_id: recordId });
}

async function handle_namecom_update_record(args: Record<string, unknown>): Promise<string> {
  const domain = String(args.domain ?? '').trim();
  const recordId = args.record_id !== undefined ? Number(args.record_id) : NaN;
  const host = args.host !== undefined ? String(args.host) : '';
  const type = String(args.type ?? '').trim().toUpperCase();
  const answer = String(args.answer ?? '').trim();
  if (!domain || isNaN(recordId) || !type || !answer) {
    return JSON.stringify({ error: 'domain, record_id, type, and answer are required' });
  }

  const creds = resolveNamecomCredentials({
    username: args.username ? String(args.username) : undefined,
    token: args.token ? String(args.token) : undefined,
  });
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not configured.' });

  const ttl = args.ttl ? Number(args.ttl) : 300;
  const priority = args.priority !== undefined ? Number(args.priority) : undefined;

  const result = await namecomUpdateRecord(domain, recordId, { host, type, answer, ttl, priority }, creds);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ ok: true, record: result.data });
}

async function handle_namecom_list_domains(args: Record<string, unknown>): Promise<string> {
  const creds = resolveNamecomCredentials({
    username: args.username ? String(args.username) : undefined,
    token: args.token ? String(args.token) : undefined,
  });
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not configured.' });

  const result = await namecomListDomains(creds);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ domains: result.data, count: result.data.length });
}

async function handle_namecom_ping(args: Record<string, unknown>): Promise<string> {
  const creds = resolveNamecomCredentials({
    username: args.username ? String(args.username) : undefined,
    token: args.token ? String(args.token) : undefined,
  });
  if (!creds) return JSON.stringify({ error: 'Name.com credentials not configured.' });

  const result = await namecomPing(creds);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ ok: true, username: result.data.username });
}

// ---------------------------------------------------------------------------
// Shared credential parameter schema (reused across all tools)
// ---------------------------------------------------------------------------

const credParams = {
  username: { type: 'string', description: 'Name.com username (from client vault or NAMECOM_USERNAME env)' },
  token: { type: 'string', description: 'Name.com API token (from client vault or NAMECOM_TOKEN env)' },
} as const;

// ---------------------------------------------------------------------------
// Module definition
// ---------------------------------------------------------------------------

export const namecomModule: AgentToolModule = {
  id: 'namecom',
  enabled: (_ctx: ToolContext) => true,

  definitions(_ctx: ToolContext): AgentToolDef[] {
    return [
      {
        type: 'function',
        function: {
          name: 'namecom_ping',
          description: 'Verify Name.com credentials work. Pass username+token from the client vault, or relies on NAMECOM_USERNAME/NAMECOM_TOKEN env vars.',
          parameters: {
            type: 'object',
            properties: { ...credParams },
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
            properties: { ...credParams },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'namecom_list_records',
          description: 'List all DNS records for a domain on Name.com. Returns record ids, types, hosts, and answers. Use this before deleting or updating a record to get the record_id.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name, e.g. innercityfireprotection.com' },
              ...credParams,
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
          description: 'Create a new DNS record on Name.com. Use type ALIAS for root CNAME-equivalent on Name.com (apex domains). For subdomains use CNAME.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name, e.g. innercityfireprotection.com' },
              host: { type: 'string', description: 'Subdomain/host — empty string "" or "@" for apex root' },
              type: { type: 'string', description: 'Record type: A, AAAA, CNAME, ALIAS, MX, TXT, SRV, NS' },
              answer: { type: 'string', description: 'Record value, e.g. 9r6ap078.up.railway.app' },
              ttl: { type: 'number', description: 'TTL in seconds (default 300)' },
              priority: { type: 'number', description: 'MX/SRV priority (omit for other types)' },
              ...credParams,
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
          description: 'Delete a DNS record by id on Name.com. Call namecom_list_records first to get the record_id.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name' },
              record_id: { type: 'number', description: 'Record id from namecom_list_records' },
              ...credParams,
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
          description: 'Update (replace) an existing DNS record by id on Name.com. Call namecom_list_records first to get the record_id.',
          parameters: {
            type: 'object',
            properties: {
              domain: { type: 'string', description: 'Domain name' },
              record_id: { type: 'number', description: 'Record id from namecom_list_records' },
              host: { type: 'string', description: 'New host/subdomain — "" or "@" for apex' },
              type: { type: 'string', description: 'New record type' },
              answer: { type: 'string', description: 'New record value' },
              ttl: { type: 'number', description: 'TTL in seconds (default 300)' },
              priority: { type: 'number', description: 'MX/SRV priority' },
              ...credParams,
            },
            required: ['domain', 'record_id', 'type', 'answer'],
            additionalProperties: false,
          },
        },
      },
    ];
  },

  handlers: {
    namecom_ping: (args) => handle_namecom_ping(args),
    namecom_list_domains: (args) => handle_namecom_list_domains(args),
    namecom_list_records: (args) => handle_namecom_list_records(args),
    namecom_create_record: (args) => handle_namecom_create_record(args),
    namecom_delete_record: (args) => handle_namecom_delete_record(args),
    namecom_update_record: (args) => handle_namecom_update_record(args),
  },
};
