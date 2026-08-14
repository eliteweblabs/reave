/**
 * POST /api/c/:slug/assistant — client-portal "speed dial" help chat.
 *
 * Public (no Clerk auth — the unguessable /c/<uid> link is the access token,
 * same as the rest of the portal). Scoped to a single contact's own portal
 * data; no tools, no other clients, no destructive actions. See
 * `src/lib/portalAssistant.ts` for the system prompt and model call.
 */
import type { APIRoute } from 'astro';
import { json } from '../../../../lib/apiJson';
import { getContact, extractPortal, contactStringField } from '../../../../lib/contactApi';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { hasFeature } from '../../../../lib/features';
import { isCraterConfigured, craterGetClientBilling } from '../../../../lib/craterClient';
import { storeListWorkForContact } from '../../../../lib/workStore';
import {
  isPortalAssistantConfigured,
  runPortalAssistantReply,
  type PortalAssistantTurn,
  type PortalAssistantJobSummary,
  type PortalAssistantBilling,
} from '../../../../lib/portalAssistant';
import { checkPortalAssistantRateLimit } from '../../../../lib/portalAssistantRateLimit';

export const prerender = false;

const MAX_MESSAGE_CHARS = 2_000;
const MAX_HISTORY_TURNS = 20;
const MAX_HISTORY_TURN_CHARS = 4_000;

const JOB_STATUS_LABEL: Record<string, string> = {
  inquiry: 'Submitted',
  active: 'In progress',
  done: 'Complete',
};


function clientIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() || 'unknown';
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

function parseHistory(raw: unknown): PortalAssistantTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: PortalAssistantTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const role = rec.role === 'assistant' ? 'assistant' : rec.role === 'user' ? 'user' : null;
    const content = typeof rec.content === 'string' ? rec.content.trim() : '';
    if (!role || !content) continue;
    out.push({ role, content: content.slice(0, MAX_HISTORY_TURN_CHARS) });
  }
  return out;
}

export const POST: APIRoute = async ({ params, request }) => {
  if (!hasFeature('client_portal') || !hasFeature('portal_assistant') || !isPortalAssistantConfigured()) {
    return json({ ok: false, error: 'Not found' }, 404);
  }

  const uid = (params.slug ?? '').trim();
  if (!uid) return json({ ok: false, error: 'Missing contact id' }, 400);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json({ ok: false, error: 'message is required' }, 400);
  if (message.length > MAX_MESSAGE_CHARS) {
    return json({ ok: false, error: 'Message is too long.' }, 400);
  }
  const history = parseHistory(body.history);

  const rate = checkPortalAssistantRateLimit(`${uid}:${clientIp(request)}`);
  if (!rate.ok) {
    return json(
      { ok: false, error: "You're sending messages a bit fast — please wait a moment and try again." },
      429,
    );
  }

  const contactRes = await getContact(uid);
  if (!contactRes.ok || contactRes.data.archived) {
    return json({ ok: false, error: 'Not found' }, 404);
  }
  const portal = extractPortal(contactRes.data) ?? {};
  if (portal.enabled === false) {
    return json({ ok: false, error: 'Not found' }, 404);
  }

  const org = await getCompanyConfig(request);

  let billing: PortalAssistantBilling | null = null;
  if (hasFeature('billing') && isCraterConfigured()) {
    try {
      const match = {
        email: contactStringField(contactRes.data.email) || undefined,
        name: contactStringField(contactRes.data.name) || undefined,
        company: contactStringField(contactRes.data.company) || undefined,
        phone: contactStringField(contactRes.data.phone) || undefined,
      };
      const b = await craterGetClientBilling(match);
      if (b.ok && b.data) {
        billing = { totalDue: b.data.totalDue, outstandingCount: b.data.outstanding.length };
      }
    } catch {
      // Billing is optional context — never fail the chat for it.
    }
  }

  let jobs: PortalAssistantJobSummary[] = [];
  try {
    const list = (await storeListWorkForContact(uid)).filter((j) => j.status !== 'archived');
    jobs = list.slice(0, 10).map((j) => ({
      title: j.title,
      statusLabel: JOB_STATUS_LABEL[j.status] || j.status,
      updated: j.updated || j.created || undefined,
    }));
  } catch {
    // Jobs are optional context — never fail the chat for it.
  }

  const clientName = contactStringField(contactRes.data.name) || 'Client';
  const company = contactStringField(contactRes.data.company);

  const result = await runPortalAssistantReply({
    context: {
      clientName,
      company,
      brand: {
        name: org.name,
        supportEmail: org.supportEmail,
        supportPhone: org.supportPhone,
        domain: org.domain,
      },
      portal: {
        headline: contactStringField(portal.headline),
        body: contactStringField(portal.body),
        fields: (portal.fields ?? []).filter((f) => f?.label && f?.value),
        data: (portal.data ?? []).filter((e) => e?.label),
      },
      billing,
      jobs,
    },
    message,
    history,
  });

  if (!result.ok) return json({ ok: false, error: result.error }, 502);
  return json({ ok: true, reply: result.reply });
};
