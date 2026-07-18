/**
 * POST /api/siri — unified endpoint for Siri Shortcuts commands
 *
 * Accepts JSON with { action, ...params } and returns text/JSON suitable for Siri display.
 * Designed for Apple Shortcuts → Get Contents of URL → Show Result workflow.
 *
 * Actions:
 * - list_clients: { action: "list_clients", query?: string, limit?: number }
 * - get_client: { action: "get_client", name: string }
 * - create_client: { action: "create_client", name: string, email?, phone?, company? }
 * - list_work: { action: "list_work", status?: string }
 * - create_work: { action: "create_work", title: string, client: string, status?, priority?, body? }
 * - send_sms: { action: "send_sms", to: string, message: string }
 * - status: { action: "status" } — quick health check
 *
 * Authentication: Bearer token (Clerk session token) or X-Siri-Key header (SIRI_API_KEY env var).
 */

import type { APIContext } from 'astro';
import { searchClientsEnhanced } from '../../../lib/clientSearch';
import {
  contactSummary,
  createContact,
  isContactApiConfigured,
  listContacts,
} from '../../../lib/contactApi';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  WORK_STATUSES,
  WORK_PRIORITIES,
} from '../../../lib/workStore';
import { parseWorkJobInput } from '../../../lib/workJobInput';
import { sendTelnyxSms } from '../../../lib/telnyxClient';
import { serverEnv } from '../../../lib/serverEnv';

export const prerender = false;

type SiriResponse = {
  ok: boolean;
  text?: string;
  data?: unknown;
  error?: string;
};

function json(body: SiriResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Check authentication: Clerk session token or X-Siri-Key header.
 */
function isAuthenticated(context: APIContext): boolean {
  const { userId } = context.locals.auth();
  if (userId) return true;

  const siriKey = serverEnv('SIRI_API_KEY')?.trim();
  if (siriKey) {
    const providedKey = context.request.headers.get('X-Siri-Key');
    if (providedKey === siriKey) return true;
  }

  return false;
}

export async function POST(context: APIContext): Promise<Response> {
  if (!isAuthenticated(context)) {
    return json({ ok: false, error: 'Unauthorized. Set X-Siri-Key header or use Clerk session.' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const action = String(body.action ?? '').trim().toLowerCase();
  const format = String(body.format ?? 'json').trim().toLowerCase();

  try {
    let result: SiriResponse;

    switch (action) {
      case 'list_clients':
        result = await handleListClients(body);
        break;
      case 'get_client':
        result = await handleGetClient(body);
        break;
      case 'create_client':
        result = await handleCreateClient(body);
        break;
      case 'list_work':
        result = await handleListWork(body);
        break;
      case 'create_work':
        result = await handleCreateWork(body);
        break;
      case 'send_sms':
        result = await handleSendSms(body);
        break;
      case 'status':
        result = await handleStatus();
        break;
      default:
        return json({ ok: false, error: `Unknown action: ${action}` }, 400);
    }

    // Return as plain text if format=text and we have text
    if (format === 'text' && result.text) {
      return textResponse(result.text, result.ok ? 200 : 400);
    }

    return json(result, result.ok ? 200 : 400);
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      500,
    );
  }
}

// ─── Action Handlers ─────────────────────────────────────────────────────────

async function handleListClients(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const query = String(params.query ?? '').trim() || undefined;
  const limitRaw = Number(params.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10;

  if (query) {
    const result = await searchClientsEnhanced(query, limit);
    if (!result.ok) return { ok: false, error: result.error };

    const clients = result.data.contacts
      .filter((c) => !c.archived)
      .map(contactSummary)
      .slice(0, limit);

    if (clients.length === 0) {
      return {
        ok: true,
        text: `No clients found matching "${query}"`,
        data: { clients: [] },
      };
    }

    const lines = clients.map((c) => {
      const parts = [c.name];
      if (c.company) parts.push(`(${c.company})`);
      if (c.email) parts.push(c.email);
      if (c.phone) parts.push(c.phone);
      return parts.join(' · ');
    });

    return {
      ok: true,
      text: `Found ${clients.length} client${clients.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`,
      data: { clients },
    };
  }

  const result = await listContacts({ limit });
  if (!result.ok) return { ok: false, error: result.error };

  const clients = result.data.contacts
    .filter((c) => !c.archived)
    .map(contactSummary)
    .slice(0, limit);

  const lines = clients.map((c) => {
    const parts = [c.name];
    if (c.company) parts.push(`(${c.company})`);
    return parts.join(' · ');
  });

  return {
    ok: true,
    text: `${clients.length} client${clients.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`,
    data: { clients, total: result.data.total },
  };
}

async function handleGetClient(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const name = String(params.name ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };

  const result = await searchClientsEnhanced(name, 5);
  if (!result.ok) return { ok: false, error: result.error };

  const clients = result.data.contacts.filter((c) => !c.archived);
  if (clients.length === 0) {
    return { ok: false, error: `No client found matching "${name}"`, text: `Client not found: ${name}` };
  }

  const client = clients[0];
  const summary = contactSummary(client);

  const lines = [
    `📇 ${summary.name}`,
    summary.company ? `🏢 ${summary.company}` : null,
    summary.email ? `📧 ${summary.email}` : null,
    summary.phone ? `📱 ${summary.phone}` : null,
    client.notes ? `\n📝 ${client.notes}` : null,
  ].filter(Boolean);

  return {
    ok: true,
    text: lines.join('\n'),
    data: { client: summary, notes: client.notes },
  };
}

async function handleCreateClient(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const name = String(params.name ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };

  const result = await createContact({
    name,
    email: String(params.email ?? '').trim() || undefined,
    phone: String(params.phone ?? '').trim() || undefined,
    company: String(params.company ?? '').trim() || undefined,
    notes: String(params.notes ?? '').trim() || undefined,
  });

  if (!result.ok) return { ok: false, error: result.error };

  const summary = contactSummary(result.data);
  return {
    ok: true,
    text: `✅ Created client: ${summary.name}${summary.company ? ` (${summary.company})` : ''}`,
    data: { client: summary },
  };
}

async function handleListWork(params: Record<string, unknown>): Promise<SiriResponse> {
  const statusRaw = String(params.status ?? '').trim().toLowerCase();
  const status = WORK_STATUSES.includes(statusRaw as (typeof WORK_STATUSES)[number])
    ? (statusRaw as (typeof WORK_STATUSES)[number])
    : undefined;

  const jobs = await storeListWork({ status });

  if (jobs.length === 0) {
    return {
      ok: true,
      text: status ? `No work items with status "${status}"` : 'No work items found',
      data: { jobs: [] },
    };
  }

  const lines = jobs.slice(0, 10).map((j) => {
    const parts = [`${j.status.toUpperCase()}: ${j.title}`];
    if (j.client) parts.push(`(${j.client})`);
    return parts.join(' · ');
  });

  const suffix = jobs.length > 10 ? `\n\n...and ${jobs.length - 10} more` : '';

  return {
    ok: true,
    text: `${jobs.length} work item${jobs.length === 1 ? '' : 's'}${status ? ` (${status})` : ''}:\n\n${lines.join('\n')}${suffix}`,
    data: { jobs: jobs.slice(0, 10), total: jobs.length },
  };
}

async function handleCreateWork(params: Record<string, unknown>): Promise<SiriResponse> {
  const title = String(params.title ?? '').trim();
  if (!title) return { ok: false, error: 'title is required' };

  const parsed = parseWorkJobInput(params);
  if ('error' in parsed) return { ok: false, error: parsed.error };

  let slug = String(params.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug && title) slug = slugFromTitle(title);

  if (!slug || !isSafeWorkSlug(slug)) {
    return { ok: false, error: 'Invalid slug' };
  }

  if (await storeReadWork(slug)) {
    return { ok: false, error: `Work item with slug "${slug}" already exists` };
  }

  const result = await storeWriteWork(slug, { ...parsed, record_origin: 'siri' });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    text: `✅ Created work item: ${result.doc.title}\nStatus: ${result.doc.status}\nClient: ${result.doc.client}`,
    data: { job: result.doc },
  };
}

async function handleSendSms(params: Record<string, unknown>): Promise<SiriResponse> {
  const to = String(params.to ?? '').trim();
  const message = String(params.message ?? '').trim();

  if (!to) return { ok: false, error: 'to (phone number) is required' };
  if (!message) return { ok: false, error: 'message is required' };

  const result = await sendTelnyxSms({ to, text: message });
  if (!result.ok) return { ok: false, error: result.error };

  return {
    ok: true,
    text: `✅ Sent SMS to ${to}`,
    data: { messageId: result.id },
  };
}

async function handleStatus(): Promise<SiriResponse> {
  const checks = {
    contactApi: isContactApiConfigured(),
    telnyx: Boolean(serverEnv('TELNYX_API_KEY')),
    anthropic: Boolean(serverEnv('ANTHROPIC_API_KEY')),
  };

  const lines = [
    '📊 Reave Status',
    '',
    `Contact API: ${checks.contactApi ? '✅' : '❌'}`,
    `Telnyx: ${checks.telnyx ? '✅' : '❌'}`,
    `Claude: ${checks.anthropic ? '✅' : '❌'}`,
  ];

  return {
    ok: true,
    text: lines.join('\n'),
    data: checks,
  };
}
