/**
 * POST /api/siri — unified endpoint for Siri Shortcuts commands
 * GET /api/siri?action=… — same actions via query string (avoids Shortcuts JSON-body 400s)
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
 * - find_client: { action: "find_client", client?: string, query?: string } — lookup for Shortcuts conditionals
 * - create_project: { action: "create_project", title: string, client?, first_name?, last_name?, company?, email? }
 * - create_proposal / audit: { action: "create_proposal" | "audit", business, ... } — quick street audit
 *   (Lighthouse, HTML, SSL, DNS, Google/social/reputation search). Runs in background; push when done.
 * - create_proposal_full / full_audit: { action: "full_audit" | "create_proposal_full", business, ... } —
 *   everything in the quick audit plus Playwright UX, broken links, and tech stack detection.
 * - send_sms: { action: "send_sms", to: string, message: string }
 * - status: { action: "status" } — quick health check
 * - add_todo / create_todo: { action: "add_todo", title: string, due_date?, priority? }
 *   Title is scanned for a spoken date/time (tomorrow, Friday at 3, August 15, …)
 *   and that value is stored as due_date when due_date is omitted.
 * - list_todos: { action: "list_todos", status?, priority?, limit? }
 * - update_todo: { action: "update_todo", id? | title?, title?, due_date?, priority?, status? }
 * - complete_todo / done_todo / mark_todo_done: { action: "complete_todo", id? | title? }
 * - delete_todo / clear_todo: { action: "delete_todo", id? | title? }
 * - start_time_tracking: { action: "start_time_tracking", query?, project?, suggested_slug? }
 *   Prompts with the most recent project when query is omitted; accepts "yes" or a project name.
 *   Finds an existing project or searches for a client and creates one, then starts the timer.
 * - stop_time_tracking: { action: "stop_time_tracking" } — stop timer and log hours
 * - time_tracking_status: { action: "time_tracking_status" } — current timer or recent project prompt
 * - record_payment / add_payment / create_payment: { action: "record_payment", customer_name, amount,
 *   payment_mode?, payment_date?, notes?, invoice_id? } — record an offline payment in Crater.
 *   Amount accepts numerals, $250, and spoken currency (100 bucks / 100 dollars).
 *   payment_mode is any Crater payment mode name (Apple Pay, Venmo, Zelle, …).
 * - prompt / ask / chat / ask_agent: { action: "prompt", message: string, thread_id?, async? }
 *   Freeform prompt to the knowledge agent. Waits briefly for a spoken reply;
 *   longer turns continue in the background and push when done.
 *
 * Authentication: Bearer token (Clerk session token) or X-Siri-Key header (SIRI_API_KEY env var).
 *
 * Sleep mode: Siri Shortcuts bypass quiet hours — audit research, agent prompts,
 * and completion push still run overnight. Automated inbound triage stays deferred.
 */

import type { APIContext } from 'astro';
import { findClientStrictForSiri, searchClientsEnhanced } from '../../../lib/clientSearch';
import { enrichContactAddressFromPlaces } from '../../../lib/contactAddressFromPlaces';
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
import { cachedCompanyBrandName } from '../../../lib/companyConfig';
import { secretMatches } from '../../../lib/secretCompare';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { startAuditProposal } from '../../../lib/siriAuditProposal';
import { hasFeature } from '../../../lib/features';
import {
  getTimeTrackingPrompt,
  getTimerStatusView,
  projectVoiceLabel,
  resolveProjectForTimeTracking,
  startTimeTrackingOnProject,
  stopTimeTrackingWithMessage,
} from '../../../lib/timeTrackingSiri';
import { formatElapsedDuration } from '../../../lib/activeTimers';
import {
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  storeCreateTodo,
  storeDeleteTodo,
  storeListTodos,
  storeMarkTodoDone,
  storeUpdateTodo,
  type TodoItem,
  type TodoPriority,
  type TodoStatus,
} from '../../../lib/todoStore';
import { craterRecordPayment, isCraterConfigured } from '../../../lib/craterClient';
import { startSiriAgentPrompt } from '../../../lib/siriAgentPrompt';
import { DEFAULT_DEPLOYMENT_TIMEZONE, getDeploymentOwnerTimezone } from '../../../lib/deploymentOwner';
import {
  extractTodoDueFromText,
  formatSiriTodoDue,
  isStructuredTodoDue,
} from '../../../lib/todoDueFromText';

export const prerender = false;

type SiriResponse = {
  ok: boolean;
  text?: string;
  data?: unknown;
  error?: string;
  code?: string;
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
 * Apple Shortcuts treats HTTP 4xx as a failed request and shows a generic
 * "Bad Request" (often attributed to Cloudflare) instead of the response body.
 * Speakable Siri errors stay 200 so Show Result / Speak Text can read them.
 */
function siriResultStatus(result: SiriResponse): number {
  if (result.ok) return 200;
  if (result.code === 'anthropic_credits') return 503;
  return 200;
}

async function parseSiriBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; text: string }> {
  const raw = await request.text();
  if (!raw.trim()) {
    return { ok: false, text: 'The shortcut sent an empty body.' };
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, body: parsed as Record<string, unknown> };
    }
    return { ok: false, text: 'The shortcut body must be a JSON object.' };
  } catch {
    const params = new URLSearchParams(raw);
    const body: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) body[key] = value;
    if (typeof body.action === 'string' && body.action.trim()) {
      return { ok: true, body };
    }
    return {
      ok: false,
      text: 'The shortcut sent invalid JSON. Use a Text request body with quoted variable pills — not the JSON field list.',
    };
  }
}

/**
 * Check authentication: deployment owner session or X-Siri-Key header.
 */
async function isAuthenticated(context: APIContext): Promise<boolean> {
  const siriKey = serverEnv('SIRI_API_KEY')?.trim();
  if (siriKey) {
    const providedKey = context.request.headers.get('X-Siri-Key');
    if (secretMatches(providedKey, siriKey)) return true;
  }

  const auth = await requireDashboardUser(context);
  return !(auth instanceof Response);
}

function paramsFromUrl(url: URL): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) body[key] = value;
  return body;
}

async function authorizeSiri(context: APIContext): Promise<Response | null> {
  if (!(await isAuthenticated(context))) {
    return json({ ok: false, error: 'Unauthorized. Set X-Siri-Key header or sign in as deployment owner.' }, 401);
  }

  const rate = checkInMemoryRateLimit(`siri:${clientIp(context.request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 60,
  });
  if (!rate.ok) {
    return json({ ok: false, error: 'Too many requests. Please try again later.' }, 429);
  }
  return null;
}

export async function GET(context: APIContext): Promise<Response> {
  const blocked = await authorizeSiri(context);
  if (blocked) return blocked;
  return dispatchSiri(context, paramsFromUrl(new URL(context.request.url)));
}

export async function POST(context: APIContext): Promise<Response> {
  const blocked = await authorizeSiri(context);
  if (blocked) return blocked;

  const query = paramsFromUrl(new URL(context.request.url));
  const parsedBody = await parseSiriBody(context.request);
  const body = parsedBody.ok ? { ...query, ...parsedBody.body } : query;
  if (!String(body.action ?? '').trim()) {
    return textResponse(
      parsedBody.ok
        ? 'Missing action.'
        : parsedBody.text,
      200,
    );
  }

  return dispatchSiri(context, body);
}

async function dispatchSiri(context: APIContext, body: Record<string, unknown>): Promise<Response> {
  const action = String(body.action ?? '').trim().toLowerCase();
  const format = String(body.format ?? 'json').trim().toLowerCase();
  const todoTimeZone = isTodoAction(action)
    ? await getDeploymentOwnerTimezone(context).catch(() => DEFAULT_DEPLOYMENT_TIMEZONE)
    : DEFAULT_DEPLOYMENT_TIMEZONE;

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
      case 'find_client':
        result = await handleFindClient(body);
        break;
      case 'create_project':
        result = await handleCreateProject(body);
        break;
      case 'create_proposal':
      case 'audit':
        result = await startAuditProposal(body, 'quick', { bypassSleepMode: true });
        break;
      case 'create_proposal_full':
      case 'full_audit':
        result = await startAuditProposal(body, 'full', { bypassSleepMode: true });
        break;
      case 'send_sms':
        result = await handleSendSms(body);
        break;
      case 'add_todo':
      case 'create_todo':
        result = await handleAddTodo(body, todoTimeZone);
        break;
      case 'list_todos':
        result = await handleListTodos(body, todoTimeZone);
        break;
      case 'update_todo':
        result = await handleUpdateTodo(body, todoTimeZone);
        break;
      case 'complete_todo':
      case 'done_todo':
      case 'mark_todo_done':
        result = await handleCompleteTodo(body, todoTimeZone);
        break;
      case 'delete_todo':
      case 'clear_todo':
        result = await handleDeleteTodo(body, todoTimeZone);
        break;
      case 'status':
        result = await handleStatus();
        break;
      case 'start_time_tracking':
        result = await handleStartTimeTracking(body);
        break;
      case 'stop_time_tracking':
        result = await handleStopTimeTracking();
        break;
      case 'time_tracking_status':
        result = await handleTimeTrackingStatus();
        break;
      case 'record_payment':
      case 'add_payment':
      case 'create_payment':
        result = await handleRecordPayment(body);
        break;
      case 'prompt':
      case 'ask':
      case 'chat':
      case 'ask_agent': {
        const promptRate = checkInMemoryRateLimit(`siri-prompt:${clientIp(context.request)}`, {
          windowMs: 10 * 60 * 1000,
          maxPerWindow: 12,
        });
        if (!promptRate.ok) {
          return json({ ok: false, error: 'Too many agent prompts. Please try again later.' }, 429);
        }
        result = await startSiriAgentPrompt(body);
        break;
      }
      default:
        return textResponse(`Unknown action: ${action || '(missing)'}`, 200);
    }

    const status = siriResultStatus(result);
    if (format === 'text' && result.text) {
      return textResponse(result.text, status);
    }

    return json(result, status);
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
        text: `No contacts found matching "${query}"`,
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
      text: `Found ${clients.length} contact${clients.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`,
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
    text: `${clients.length} contact${clients.length === 1 ? '' : 's'}:\n\n${lines.join('\n')}`,
    data: { clients, total: result.data.total },
  };
}

async function handleGetClient(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const name = String(params.name ?? '').trim();
  if (!name) return { ok: false, error: 'name is required' };

  const result = await findClientStrictForSiri(name);
  if (!result.ok) return { ok: false, error: result.error };

  if (!result.found) {
    if (result.ambiguous?.length) {
      const names = result.ambiguous.map((c) => c.name).join(', ');
      const msg = `Multiple contacts match "${name}": ${names}. Please be more specific.`;
      return { ok: false, error: msg, text: msg };
    }
    const msg = `Contact not found: ${name}. Would you like to add a new contact?`;
    return { ok: false, error: msg, text: msg };
  }

  const client = result.contact;
  const summary = contactSummary(client);

  const lines = [
    summary.name,
    summary.company ? `Company: ${summary.company}` : null,
    summary.email ? `Email: ${summary.email}` : null,
    summary.phone ? `Phone: ${summary.phone}` : null,
    client.notes ? `Notes: ${client.notes}` : null,
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

  await enrichContactAddressFromPlaces(result.data.uid);

  const summary = contactSummary(result.data);
  return {
    ok: true,
    text: `Created contact: ${summary.name}${summary.company ? ` (${summary.company})` : ''}`,
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

function buildPersonName(params: Record<string, unknown>): string {
  const full = String(params.name ?? '').trim();
  if (full) return full;
  const first = String(params.first_name ?? '').trim();
  const last = String(params.last_name ?? '').trim();
  return [first, last].filter(Boolean).join(' ');
}

async function resolveClientForProject(
  params: Record<string, unknown>,
): Promise<
  | { ok: true; uid: string; name: string; created: boolean }
  | { ok: false; error: string; text?: string }
> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const clientQuery = String(params.client ?? params.client_name ?? '').trim();
  const firstName = String(params.first_name ?? '').trim();
  const lastName = String(params.last_name ?? '').trim();
  const company = String(params.company ?? '').trim() || undefined;
  const email = String(params.email ?? '').trim() || undefined;
  const phone = String(params.phone ?? '').trim() || undefined;

  if (clientQuery) {
    const lookup = await findClientStrictForSiri(clientQuery);
    if (!lookup.ok) return { ok: false, error: lookup.error };

    if (lookup.found) {
      return {
        ok: true,
        uid: lookup.contact.uid,
        name: lookup.contact.name.trim(),
        created: false,
      };
    }

    if (lookup.ambiguous?.length) {
      const names = lookup.ambiguous.map((c) => c.name).join(', ');
      const msg = `Multiple contacts match "${clientQuery}": ${names}. Please be more specific.`;
      return { ok: false, error: msg, text: msg };
    }
  }

  const newName = buildPersonName(params);
  if (!newName) {
    const msg = clientQuery
      ? `Contact not found: ${clientQuery}. Provide first name and last name to create a new contact.`
      : 'Contact first name and last name are required when no existing contact is selected.';
    return { ok: false, error: msg, text: msg };
  }

  if (!String(params.name ?? '').trim() && (!firstName || !lastName)) {
    const msg = 'First name and last name are required for a new contact.';
    return { ok: false, error: msg, text: msg };
  }

  const created = await createContact({
    name: newName,
    email,
    phone,
    company,
  });
  if (!created.ok) return { ok: false, error: created.error };

  await enrichContactAddressFromPlaces(created.data.uid);

  return {
    ok: true,
    uid: created.data.uid,
    name: created.data.name.trim(),
    created: true,
  };
}

async function handleFindClient(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const query = String(params.query ?? params.client ?? params.name ?? '').trim();
  if (!query) return { ok: false, error: 'contact or query is required' };

  const result = await findClientStrictForSiri(query);
  if (!result.ok) return { ok: false, error: result.error };

  if (!result.found) {
    if (result.ambiguous?.length) {
      const names = result.ambiguous.map((c) => c.name).join(', ');
      const msg = `Multiple contacts match "${query}": ${names}. Please be more specific.`;
      return { ok: true, text: msg, data: { found: false, query, ambiguous: true } };
    }
    return {
      ok: true,
      text: `Contact not found: ${query}. Would you like to add a new contact?`,
      data: { found: false, query },
    };
  }

  const client = contactSummary(result.contact);
  const text = `Found ${client.name}${client.company ? ` at ${client.company}` : ''}`;

  return {
    ok: true,
    text,
    data: { found: true, client, match_count: result.match_count },
  };
}

async function handleCreateProject(params: Record<string, unknown>): Promise<SiriResponse> {
  const title = String(params.title ?? '').trim();
  if (!title) {
    const msg = 'Project title is required.';
    return { ok: false, error: msg, text: msg };
  }

  const clientResult = await resolveClientForProject(params);
  if (!clientResult.ok) {
    return { ok: false, error: clientResult.error, text: clientResult.text ?? clientResult.error };
  }

  let slug = String(params.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug) slug = slugFromTitle(title);

  if (!slug || !isSafeWorkSlug(slug)) {
    return { ok: false, error: 'Invalid project slug' };
  }

  if (await storeReadWork(slug)) {
    const msg = `A project named "${title}" already exists.`;
    return { ok: false, error: msg, text: msg };
  }

  const parsed = parseWorkJobInput({
    ...params,
    title,
    client: clientResult.name,
    contact_uid: clientResult.uid,
    contact_name: clientResult.name,
    record_origin: 'siri',
  });
  if ('error' in parsed) return { ok: false, error: parsed.error, text: parsed.error };

  const result = await storeWriteWork(slug, parsed);
  if (!result.ok) return { ok: false, error: result.error };

  const clientNote = clientResult.created
    ? `Created new client ${clientResult.name}. `
    : '';

  return {
    ok: true,
    text: `${clientNote}Created project ${result.doc.title} for ${result.doc.client}. Status: ${result.doc.status}.`,
    data: {
      job: result.doc,
      client: { uid: clientResult.uid, name: clientResult.name, created: clientResult.created },
    },
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
    text: `Created work item: ${result.doc.title}\nStatus: ${result.doc.status}\nContact: ${result.doc.client}`,
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
    text: `Sent SMS to ${to}`,
    data: { messageId: result.id },
  };
}

function isTodoAction(action: string): boolean {
  return (
    action === 'add_todo' ||
    action === 'create_todo' ||
    action === 'list_todos' ||
    action === 'update_todo' ||
    action === 'complete_todo' ||
    action === 'done_todo' ||
    action === 'mark_todo_done' ||
    action === 'delete_todo' ||
    action === 'clear_todo'
  );
}

function todosUnavailable(): SiriResponse {
  return {
    ok: false,
    error: 'To-do list is not available — DATABASE_URL is not configured.',
    text: 'To-do list is not available on this install.',
  };
}

function todoTitleFromParams(params: Record<string, unknown>): string {
  return String(params.title ?? params.todo ?? params.text ?? params.query ?? '').trim();
}

function formatTodoLine(todo: TodoItem, timeZone = DEFAULT_DEPLOYMENT_TIMEZONE): string {
  const bits = [todo.title];
  if (todo.priority && todo.priority !== 'normal') bits.push(`(${todo.priority})`);
  if (todo.due_date) bits.push(formatSiriTodoDue(todo.due_date, { timeZone }));
  if (todo.status === 'done') bits.push('[done]');
  return bits.join(' ');
}

async function resolveTodoFromParams(
  params: Record<string, unknown>,
  opts?: { preferOpen?: boolean; timeZone?: string },
): Promise<{ todo: TodoItem } | { error: string; text: string; data?: unknown }> {
  const idRaw = params.id;
  const id = typeof idRaw === 'number' ? idRaw : Number(String(idRaw ?? '').trim());
  const query = todoTitleFromParams(params);

  const pool = await storeListTodos();

  if (Number.isInteger(id) && id >= 1) {
    const todo = pool.find((t) => t.id === id);
    if (!todo) {
      return {
        error: `No to-do with id ${id}`,
        text: `No to-do with id ${id}.`,
      };
    }
    return { todo };
  }

  if (!query) {
    return {
      error: 'title or id is required',
      text: 'Say the to-do title, or pass an id.',
    };
  }

  const needle = query.toLowerCase();
  const scoped = opts?.preferOpen ? pool.filter((t) => t.status === 'open') : pool;
  const searchIn = (list: TodoItem[]) => {
    const exact = list.filter((t) => t.title.toLowerCase() === needle);
    if (exact.length === 1) return { todo: exact[0] } as const;
    const partial = list.filter((t) => t.title.toLowerCase().includes(needle));
    if (partial.length === 1) return { todo: partial[0] } as const;
    if (partial.length > 1 || exact.length > 1) {
      const candidates = (exact.length > 1 ? exact : partial).slice(0, 8);
      const lines = candidates.map((t) => `#${t.id} ${formatTodoLine(t, opts?.timeZone)}`);
      return {
        error: `Multiple to-dos match "${query}"`,
        text: `Multiple to-dos match "${query}":\n\n${lines.join('\n')}\n\nPass id to pick one.`,
        data: { candidates },
      } as const;
    }
    return null;
  };

  const preferred = searchIn(scoped);
  if (preferred) return preferred;

  if (opts?.preferOpen && scoped.length !== pool.length) {
    const fallback = searchIn(pool);
    if (fallback) return fallback;
  }

  return {
    error: `No to-do matching "${query}"`,
    text: `No to-do matching "${query}".`,
  };
}

async function handleAddTodo(
  params: Record<string, unknown>,
  timeZone: string,
): Promise<SiriResponse> {
  if (!isTodoDbConfigured()) return todosUnavailable();

  let title = todoTitleFromParams(params);
  if (!title) return { ok: false, error: 'title is required', text: 'What should I add to your to-do list?' };

  const priorityRaw = String(params.priority ?? '').trim().toLowerCase();
  const priority = priorityRaw
    ? normalizeTodoPriority(priorityRaw)
    : ('normal' as TodoPriority);
  if (priorityRaw && !priority) {
    return { ok: false, error: 'invalid priority', text: 'Priority must be low, normal, high, or urgent.' };
  }

  const dueRaw = params.due_date ?? params.due;
  let due_date: string | null = null;
  if (dueRaw != null && String(dueRaw).trim() !== '') {
    const dueText = String(dueRaw).trim();
    if (isStructuredTodoDue(dueText)) {
      due_date = dueText;
    } else {
      const fromDue = extractTodoDueFromText(dueText, { timeZone });
      due_date = fromDue.due_date;
    }
  } else {
    const extracted = extractTodoDueFromText(title, { timeZone });
    if (extracted.matched) {
      title = extracted.title;
      due_date = extracted.due_date;
    }
  }

  const result = await storeCreateTodo({
    title,
    due_date,
    priority,
    section: params.section != null ? String(params.section).trim() || null : undefined,
    created_by: 'staff',
  });
  if (!result.ok) return { ok: false, error: result.error, text: result.error };

  const dueBit = result.todo.due_date
    ? ` · ${formatSiriTodoDue(result.todo.due_date, { timeZone })}`
    : '';
  const priorityBit =
    result.todo.priority && result.todo.priority !== 'normal' ? ` · ${result.todo.priority}` : '';

  return {
    ok: true,
    text: `Added to-do: ${result.todo.title}${priorityBit}${dueBit}`,
    data: { todo: result.todo },
  };
}

async function handleListTodos(
  params: Record<string, unknown>,
  timeZone: string,
): Promise<SiriResponse> {
  if (!isTodoDbConfigured()) return todosUnavailable();

  const statusRaw = String(params.status ?? 'open').trim().toLowerCase();
  const priorityRaw = String(params.priority ?? '').trim().toLowerCase();
  const status = statusRaw === 'all' ? undefined : normalizeTodoStatus(statusRaw);
  const priority = normalizeTodoPriority(priorityRaw);
  if (statusRaw && statusRaw !== 'all' && !status) {
    return { ok: false, error: 'invalid status', text: 'Status must be open, done, or all.' };
  }
  if (priorityRaw && !priority) {
    return { ok: false, error: 'invalid priority', text: 'Priority must be low, normal, high, or urgent.' };
  }

  const limitRaw = Number(params.limit ?? 15);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 50) : 15;

  const todos = (await storeListTodos({ status, priority })).slice(0, limit);
  if (!todos.length) {
    return {
      ok: true,
      text: status === 'done' ? 'No completed to-dos.' : 'No open to-dos.',
      data: { todos: [], count: 0 },
    };
  }

  const lines = todos.map((t) => `• ${formatTodoLine(t, timeZone)}`);
  const label = status === 'done' ? 'Completed' : status === 'open' || !statusRaw || statusRaw === 'open' ? 'Open' : 'Matching';
  return {
    ok: true,
    text: `${label} to-dos (${todos.length}):\n\n${lines.join('\n')}`,
    data: { todos, count: todos.length },
  };
}

async function handleUpdateTodo(
  params: Record<string, unknown>,
  timeZone: string,
): Promise<SiriResponse> {
  if (!isTodoDbConfigured()) return todosUnavailable();

  const resolved = await resolveTodoFromParams(params, { preferOpen: true, timeZone });
  if ('error' in resolved) return { ok: false, ...resolved };

  const patch: {
    title?: string;
    due_date?: string | null;
    priority?: TodoPriority;
    status?: TodoStatus;
  } = {};

  if (params.new_title != null || (params.title != null && params.id != null)) {
    const nextTitle = String(params.new_title ?? params.title ?? '').trim();
    if (nextTitle) patch.title = nextTitle;
  }
  if (params.due_date !== undefined || params.due !== undefined) {
    const dueRaw = params.due_date ?? params.due;
    if (dueRaw == null || String(dueRaw).trim() === '') {
      patch.due_date = null;
    } else {
      const dueText = String(dueRaw).trim();
      patch.due_date = isStructuredTodoDue(dueText)
        ? dueText
        : extractTodoDueFromText(dueText, { timeZone }).due_date;
    }
  }
  if (params.priority != null) {
    const priority = normalizeTodoPriority(params.priority);
    if (!priority) {
      return { ok: false, error: 'invalid priority', text: 'Priority must be low, normal, high, or urgent.' };
    }
    patch.priority = priority;
  }
  if (params.status != null) {
    const status = normalizeTodoStatus(params.status);
    if (!status) {
      return { ok: false, error: 'invalid status', text: 'Status must be open or done.' };
    }
    patch.status = status;
  }

  if (!Object.keys(patch).length) {
    return {
      ok: false,
      error: 'Nothing to update',
      text: 'Pass new_title, due_date, priority, or status to update.',
    };
  }

  const result = await storeUpdateTodo(resolved.todo.id, patch);
  if (!result.ok) return { ok: false, error: result.error, text: result.error };

  return {
    ok: true,
    text: `Updated to-do: ${formatTodoLine(result.todo, timeZone)}`,
    data: { todo: result.todo },
  };
}

async function handleCompleteTodo(
  params: Record<string, unknown>,
  timeZone: string,
): Promise<SiriResponse> {
  if (!isTodoDbConfigured()) return todosUnavailable();

  const resolved = await resolveTodoFromParams(params, { preferOpen: true, timeZone });
  if ('error' in resolved) return { ok: false, ...resolved };

  const result = await storeMarkTodoDone(resolved.todo.id);
  if (!result.ok) return { ok: false, error: result.error, text: result.error };

  return {
    ok: true,
    text: `Completed to-do: ${result.todo.title}`,
    data: { todo: result.todo },
  };
}

async function handleDeleteTodo(
  params: Record<string, unknown>,
  timeZone: string,
): Promise<SiriResponse> {
  if (!isTodoDbConfigured()) return todosUnavailable();

  const resolved = await resolveTodoFromParams(params, { timeZone });
  if ('error' in resolved) return { ok: false, ...resolved };

  const result = await storeDeleteTodo(resolved.todo.id);
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'Failed to delete', text: result.error ?? 'Failed to delete to-do.' };
  }

  return {
    ok: true,
    text: `Deleted to-do: ${resolved.todo.title}`,
    data: { id: resolved.todo.id, deleted: true, title: resolved.todo.title },
  };
}

function timeTrackingDisabled(): SiriResponse {
  return {
    ok: false,
    error: 'Time tracking is not enabled on this install',
    text: 'Time tracking is not enabled on this install.',
  };
}

function billingUnavailable(): SiriResponse {
  return {
    ok: false,
    error: 'Billing is not available — enable the billing feature and configure Crater.',
    text: 'Billing is not available on this install.',
  };
}

function parsePaymentAmount(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  const text = String(raw ?? '').trim();
  if (!text) return null;

  // Spoken / Shortcuts input: "$100", "100 bucks", "100 dollars", "USD 250.50"
  const cleaned = text
    .replace(/[$,]/g, '')
    .replace(/\b(usd|us\s*dollars?|dollars?|bucks?)\b/gi, '')
    .replace(/\s+/g, '')
    .replace(/^usd/i, '');
  if (cleaned) {
    const amount = Number(cleaned);
    if (Number.isFinite(amount)) return amount;
  }

  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const extracted = Number(match[1]);
  return Number.isFinite(extracted) ? extracted : null;
}

function normalizePaymentMode(raw: unknown): string | undefined {
  if (raw == null || raw === '') return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  const key = trimmed.toLowerCase().replace(/[\s_-]+/g, '');
  const aliases: Record<string, string> = {
    cash: 'Cash',
    check: 'Check',
    cheque: 'Check',
    creditcard: 'Credit Card',
    card: 'Credit Card',
    cc: 'Credit Card',
    banktransfer: 'Bank Transfer',
    transfer: 'Bank Transfer',
    ach: 'Bank Transfer',
    wire: 'Bank Transfer',
    applepay: 'Apple Pay',
    venmo: 'Venmo',
    zelle: 'Zelle',
    stripe: 'Stripe',
    other: 'Other',
  };
  return aliases[key] ?? trimmed;
}

function formatPaymentDollars(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function paymentModeLabel(mode: string): string {
  return mode;
}

async function handleRecordPayment(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!hasFeature('billing') || !isCraterConfigured()) return billingUnavailable();

  const customerName = String(
    params.customer_name ??
      params.customerName ??
      params.customer ??
      params.client ??
      params.name ??
      '',
  ).trim();
  if (!customerName) {
    return {
      ok: false,
      error: 'customer_name is required',
      text: 'Which customer should I record this payment for?',
    };
  }

  const amount = parsePaymentAmount(params.amount ?? params.payment_amount);
  if (amount == null || amount <= 0) {
    return {
      ok: false,
      error: 'amount must be a positive number',
      text: 'How much was the payment?',
    };
  }

  const specifiedMode = normalizePaymentMode(
    params.payment_mode ??
      params.payment_method ??
      params.paymentMethod ??
      params.mode ??
      params.method,
  );

  const paymentDateRaw = params.payment_date ?? params.date;
  const paymentDate =
    paymentDateRaw == null || paymentDateRaw === ''
      ? undefined
      : String(paymentDateRaw).trim();

  const notesRaw = params.notes ?? params.note;
  const notes =
    notesRaw == null || notesRaw === '' ? undefined : String(notesRaw).trim();

  const invoiceRaw = params.invoice_id ?? params.invoice;
  let invoiceId: number | undefined;
  if (invoiceRaw != null && invoiceRaw !== '') {
    const parsed = typeof invoiceRaw === 'number' ? invoiceRaw : Number(String(invoiceRaw).trim());
    if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
      return {
        ok: false,
        error: 'invoice_id must be a positive integer',
        text: 'Invoice id must be a whole number.',
      };
    }
    invoiceId = parsed;
  }

  const result = await craterRecordPayment({
    customerName,
    amount,
    paymentMode: specifiedMode,
    paymentDate,
    notes,
    invoiceId,
  });

  if (!result.ok) {
    const speakable =
      result.status === 300
        ? `I need more detail to record that payment: ${result.error}`
        : result.error;
    return {
      ok: false,
      error: result.error,
      text: speakable,
      data: { status: result.status },
    };
  }

  const modeBit = specifiedMode ? ` via ${paymentModeLabel(specifiedMode)}` : '';
  const invoiceBit = invoiceId != null ? ` on invoice ${invoiceId}` : '';
  const dateBit = paymentDate ? ` for ${paymentDate}` : '';
  const recordedName =
    result.data && typeof result.data === 'object' && 'customer_name' in result.data
      ? String((result.data as { customer_name?: unknown }).customer_name ?? customerName)
      : customerName;

  return {
    ok: true,
    text: `Recorded ${formatPaymentDollars(amount)} payment from ${recordedName}${modeBit}${invoiceBit}${dateBit}.`,
    data: result.data,
  };
}

async function handleStartTimeTracking(params: Record<string, unknown>): Promise<SiriResponse> {
  if (!hasFeature('time_tracking')) return timeTrackingDisabled();

  const query = String(params.query ?? params.project ?? '').trim();
  const suggestedSlug = String(params.suggested_slug ?? params.slug ?? '').trim() || undefined;

  if (!query) {
    const prompt = await getTimeTrackingPrompt();
    return {
      ok: true,
      text: prompt.text,
      data: {
        needs_input: !prompt.running,
        running: Boolean(prompt.running),
        suggested: prompt.suggested
          ? {
              slug: prompt.suggested.slug,
              title: prompt.suggested.title,
              client: prompt.suggested.client,
              label: projectVoiceLabel(prompt.suggested),
            }
          : null,
        timer: prompt.running
          ? {
              job_slug: prompt.running.jobSlug,
              started_at: prompt.running.startedAt,
              elapsed: formatElapsedDuration(prompt.running.startedAt),
            }
          : null,
      },
    };
  }

  const resolved = await resolveProjectForTimeTracking(query, suggestedSlug);
  if (!resolved.ok) {
    return { ok: false, error: resolved.error, text: resolved.error };
  }

  const started = await startTimeTrackingOnProject(resolved.job);
  if (!started.ok) {
    return { ok: false, error: started.error, text: started.error };
  }

  const createdNote = resolved.created ? ' Created new project.' : '';
  return {
    ok: true,
    text: `${started.text}${createdNote}`,
    data: {
      job: {
        slug: resolved.job.slug,
        title: resolved.job.title,
        client: resolved.job.client,
        created: resolved.created,
      },
      timer: started.timer,
      switched: started.switched,
      previous: started.previous,
    },
  };
}

async function handleStopTimeTracking(): Promise<SiriResponse> {
  if (!hasFeature('time_tracking')) return timeTrackingDisabled();

  const result = await stopTimeTrackingWithMessage();
  if (!result.ok) {
    return { ok: false, error: result.error, text: result.text ?? result.error };
  }

  return {
    ok: true,
    text: result.text,
    data: {
      job_slug: result.jobSlug,
      hours: result.hours,
      logged: result.logged,
    },
  };
}

async function handleTimeTrackingStatus(): Promise<SiriResponse> {
  if (!hasFeature('time_tracking')) return timeTrackingDisabled();

  const view = await getTimerStatusView();
  if (view.running && view.timer) {
    const label = view.timer.job?.label || view.timer.job_slug;
    return {
      ok: true,
      text: `Tracking ${label} — ${view.timer.elapsed}.`,
      data: {
        running: true,
        timer: {
          job_slug: view.timer.job_slug,
          started_at: view.timer.started_at,
          elapsed: view.timer.elapsed,
        },
        job: view.timer.job,
      },
    };
  }

  const prompt = await getTimeTrackingPrompt();
  return {
    ok: true,
    text: prompt.text,
    data: {
      running: false,
      suggested: prompt.suggested
        ? {
            slug: prompt.suggested.slug,
            title: prompt.suggested.title,
            client: prompt.suggested.client,
            label: projectVoiceLabel(prompt.suggested),
          }
        : null,
    },
  };
}

async function handleStatus(): Promise<SiriResponse> {
  const checks = {
    contactApi: isContactApiConfigured(),
    telnyx: Boolean(serverEnv('TELNYX_API_KEY')),
    anthropic: Boolean(serverEnv('ANTHROPIC_API_KEY')),
  };

  const statusWord = (up: boolean) => (up ? 'online' : 'offline');

  const lines = [
    `${cachedCompanyBrandName()} Status`,
    '',
    `Contact API: ${statusWord(checks.contactApi)}`,
    `Telnyx: ${statusWord(checks.telnyx)}`,
    `Claude: ${statusWord(checks.anthropic)}`,
  ];

  return {
    ok: true,
    text: lines.join('\n'),
    data: checks,
  };
}
