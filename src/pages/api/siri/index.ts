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
 * - find_client: { action: "find_client", client?: string, query?: string } — lookup for Shortcuts conditionals
 * - create_project: { action: "create_project", title: string, client?, first_name?, last_name?, company?, email? }
 * - create_proposal / audit: { action: "create_proposal" | "audit", business, ... } — quick street audit
 *   (Lighthouse, HTML, SSL, DNS, Google/social/reputation search). Runs in background; push when done.
 * - create_proposal_full / full_audit: { action: "full_audit" | "create_proposal_full", business, ... } —
 *   everything in the quick audit plus Playwright UX, broken links, and tech stack detection.
 * - send_sms: { action: "send_sms", to: string, message: string }
 * - status: { action: "status" } — quick health check
 *
 * Authentication: Bearer token (Clerk session token) or X-Siri-Key header (SIRI_API_KEY env var).
 */

import type { APIContext } from 'astro';
import { findClientStrictForSiri, searchClientsEnhanced } from '../../../lib/clientSearch';
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
import { runKnowledgeAgent } from '../../../lib/agentRunner';
import { agentAlertUserId, notifyAdminAgentOfSiriProposalComplete } from '../../../lib/adminAgentAlert';
import { createLogger } from '../../../lib/logger';
import { cachedCompanyBrandName } from '../../../lib/companyConfig';
import { secretMatches } from '../../../lib/secretCompare';
import { requireDashboardUser } from '../../../lib/dashboardAuth';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';

const log = createLogger('siri-proposal');

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

export async function POST(context: APIContext): Promise<Response> {
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
      case 'find_client':
        result = await handleFindClient(body);
        break;
      case 'create_project':
        result = await handleCreateProject(body);
        break;
      case 'create_proposal':
      case 'audit':
        result = await handleAuditProposal(body, 'quick');
        break;
      case 'create_proposal_full':
      case 'full_audit':
        result = await handleAuditProposal(body, 'full');
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

  const result = await findClientStrictForSiri(name);
  if (!result.ok) return { ok: false, error: result.error };

  if (!result.found) {
    if (result.ambiguous?.length) {
      const names = result.ambiguous.map((c) => c.name).join(', ');
      const msg = `Multiple clients match "${name}": ${names}. Please be more specific.`;
      return { ok: false, error: msg, text: msg };
    }
    const msg = `Client not found: ${name}. Would you like to add a new client?`;
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

  const summary = contactSummary(result.data);
  return {
    ok: true,
    text: `Created client: ${summary.name}${summary.company ? ` (${summary.company})` : ''}`,
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
      const msg = `Multiple clients match "${clientQuery}": ${names}. Please be more specific.`;
      return { ok: false, error: msg, text: msg };
    }
  }

  const newName = buildPersonName(params);
  if (!newName) {
    const msg = clientQuery
      ? `Client not found: ${clientQuery}. Provide first name and last name to create a new client.`
      : 'Client first name and last name are required when no existing client is selected.';
    return { ok: false, error: msg, text: msg };
  }

  if (!String(params.name ?? '').trim() && (!firstName || !lastName)) {
    const msg = 'First name and last name are required for a new client.';
    return { ok: false, error: msg, text: msg };
  }

  const created = await createContact({
    name: newName,
    email,
    phone,
    company,
  });
  if (!created.ok) return { ok: false, error: created.error };

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
  if (!query) return { ok: false, error: 'client or query is required' };

  const result = await findClientStrictForSiri(query);
  if (!result.ok) return { ok: false, error: result.error };

  if (!result.found) {
    if (result.ambiguous?.length) {
      const names = result.ambiguous.map((c) => c.name).join(', ');
      const msg = `Multiple clients match "${query}": ${names}. Please be more specific.`;
      return { ok: true, text: msg, data: { found: false, query, ambiguous: true } };
    }
    return {
      ok: true,
      text: `Client not found: ${query}. Would you like to add a new client?`,
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

type AuditTier = 'quick' | 'full';

/**
 * Siri "audit" / "create proposal" (quick) or "full audit" (comprehensive) — pass a business
 * description (name, or name + street/town) and the research agent finds the real business,
 * resolves or creates the client, runs the appropriate audit tool sequence, and files an
 * inquiry project. Runs in the background; the finished audit triggers a dashboard alert and
 * push notification when done.
 */
async function handleAuditProposal(
  params: Record<string, unknown>,
  tier: AuditTier,
): Promise<SiriResponse> {
  if (!isContactApiConfigured()) {
    return { ok: false, error: 'Contact API not configured' };
  }

  const url = String(params.url ?? params.website ?? params.link ?? '').trim();
  const business = String(
    params.business ?? params.business_name ?? params.company ?? params.name ?? params.query ?? '',
  ).trim();
  const phone = String(params.phone ?? '').trim();
  const email = String(params.email ?? '').trim();
  const notes = String(params.notes ?? params.context ?? '').trim();

  if (!business) {
    const msg = 'Business name is required — include street or town if the name is common.';
    return { ok: false, error: msg, text: msg };
  }

  const label = business;

  runProposalResearch({ url, business, phone, email, notes, label, tier }).catch((e) => {
    log.error('background research failed', e);
  });

  const ack =
    tier === 'full'
      ? `Running full audit on ${label} now. You'll get an alert in Admin when the audit and project are ready.`
      : `Auditing ${label} now. You'll get an alert in Admin when the audit and project are ready.`;

  return {
    ok: true,
    text: ack,
    data: { started: true, tier, label, url: url || null, business: business || null },
  };
}

async function runProposalResearch(input: {
  url: string;
  business: string;
  phone: string;
  email: string;
  notes: string;
  label: string;
  tier: AuditTier;
}): Promise<void> {
  const givenLines = [
    input.business ? `Business name: ${input.business}` : null,
    input.url ? `Website/URL: ${input.url}` : null,
    input.phone ? `Phone: ${input.phone}` : null,
    input.email ? `Email: ${input.email}` : null,
    input.notes ? `Notes: ${input.notes}` : null,
  ].filter((l): l is string => Boolean(l));

  const knowledgeSlug =
    input.tier === 'full' ? 'inquiry-website-audit' : 'inquiry-website-audit-quick';
  const tierLabel = input.tier === 'full' ? 'Full audit' : 'Quick audit (street)';

  const auditToolsStep =
    input.tier === 'full'
      ? '3. Run the **full** audit tool sequence on the site: fetch_url, lighthouse_audit, ssl_check, ' +
        'check_links, dns_check, brave_search (Google Business Profile, Yelp, reviews/reputation, social), ' +
        'playwright_audit (real-browser UX/UI on desktop + mobile), and detect_tech_stack. Run read-only ' +
        'tools in parallel when possible.'
      : '3. Run the **quick** audit tool sequence on the site (street-speed — skip slow tools): fetch_url, ' +
        'lighthouse_audit, ssl_check, dns_check, and brave_search (Google Business Profile, Yelp, ' +
        'reviews/reputation, social). Do **not** run playwright_audit, check_links, or detect_tech_stack — ' +
        'those belong in the full audit tier. Run read-only tools in parallel when possible.';

  const userText = [
    `Siri shortcut "${tierLabel}" was triggered with only the raw information below — there is no one ` +
      'here to ask follow-up questions, so proceed autonomously and make reasonable, clearly-noted assumptions ' +
      'instead of stopping to ask.',
    '',
    'The business description may be just a name or include street, town, or other disambiguating details ' +
      '(e.g. "Joe\'s Pizza on Main Street in Portland"). Treat the full string as your search query.',
    '',
    ...givenLines,
    '',
    `Follow the ${tierLabel.toLowerCase()} playbook (read_knowledge slug "${knowledgeSlug}" first):`,
    '1. If no URL was given, use brave_search with the full business description (plus phone/email if provided) ' +
      'to identify the correct business and find its website; use any location hints in the description to ' +
      'disambiguate common names. If no website can be found, say so in the audit and continue with whatever ' +
      'public info you can find.',
    '2. resolve_contact for the client. If there is no match, create_contact with kind "proposed". If a match ' +
      'exists but kindExplicit is false (never classified), update_contact with kind "proposed". Use the business ' +
      'name as the contact name when no personal name is known, and save whatever phone/email/company was given.',
    auditToolsStep,
    '4. create_work with status "inquiry", contact_uid set, title "Website Redesign — {Business Name}" (best ' +
      'known name), and a complete markdown audit body following the required section structure — 1,200+ ' +
      'characters for quick tier, 1,500+ for full tier, not a stub. If a quick-audit project already exists ' +
      'and this is a full audit, use update_work instead of creating a duplicate.',
    '5. End your final reply with a line formatted exactly like ' +
      '`Project: <slug>` followed by 2-3 sentences summarizing the top findings and the recommended next step.',
  ].join('\n');

  const userId = agentAlertUserId();
  const researchStartedAt = Date.now();

  let reply: string;
  try {
    reply = await runKnowledgeAgent({
      userText,
      context: userId ? { userId } : {},
    });
  } catch (e) {
    reply = `Research failed: ${e instanceof Error ? e.message : String(e)}`;
    log.error('runKnowledgeAgent threw', e instanceof Error ? e : new Error(String(e)));
  }

  await notifyAdminAgentOfSiriProposalComplete({
    label: input.label,
    reply,
    tier: input.tier,
    researchStartedAt,
  }).catch((e) => log.warn('proposal notify failed', e instanceof Error ? e : new Error(String(e))));
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
    text: `Created work item: ${result.doc.title}\nStatus: ${result.doc.status}\nClient: ${result.doc.client}`,
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
