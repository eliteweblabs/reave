/**
 * POST /api/c/:slug/assistant — client-portal "speed dial" help chat.
 *
 * Public (no Clerk auth — the unguessable /c/<uid> link is the access token,
 * same as the rest of the portal). Scoped to a single contact's own portal
 * data; no tools, no other clients, no destructive actions. See
 * `src/lib/portalAssistant.ts` for the system prompt and model call.
 */
import type { APIRoute } from 'astro';
import { assistantRateLimitResponse, parseAssistantPostRequest } from '../../../../lib/assistantRoute';
import { jsonResponse } from '../../../../lib/apiResponse';
import { clientIp } from '../../../../lib/clientIp';
import { getContact, extractPortal, contactStringField } from '../../../../lib/contactApi';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { hasFeature } from '../../../../lib/features';
import { isCraterConfigured, craterGetClientBilling } from '../../../../lib/craterClient';
import { isWorkArchived, storeListWorkForContact } from '../../../../lib/workStore';
import {
  isPortalAssistantConfigured,
  runPortalAssistantReply,
  type PortalAssistantTurn,
  type PortalAssistantJobSummary,
  type PortalAssistantBilling,
} from '../../../../lib/portalAssistant';
export const prerender = false;

const JOB_STATUS_LABEL: Record<string, string> = {
  inquiry: 'Submitted',
  audit: 'Audit',
  active: 'In progress',
  done: 'Archived',
  archived: 'Archived',
};

export const POST: APIRoute = async ({ params, request }) => {
  if (!hasFeature('client_portal') || !hasFeature('portal_assistant') || !isPortalAssistantConfigured()) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }

  const uid = (params.slug ?? '').trim();
  if (!uid) return jsonResponse({ ok: false, error: 'Missing contact id' }, 400);

  const parsed = await parseAssistantPostRequest<PortalAssistantTurn>(request);
  if (!parsed.ok) return parsed.response;
  const { message, history } = parsed;

  const rateLimited = assistantRateLimitResponse(`${uid}:${clientIp(request)}`);
  if (rateLimited) return rateLimited;

  const contactRes = await getContact(uid);
  if (!contactRes.ok || contactRes.data.archived) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
  }
  const portal = extractPortal(contactRes.data) ?? {};
  if (portal.enabled === false) {
    return jsonResponse({ ok: false, error: 'Not found' }, 404);
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
    const list = await storeListWorkForContact(uid);
    jobs = list
      .slice()
      .sort((a, b) => Number(isWorkArchived(a.status)) - Number(isWorkArchived(b.status)))
      .slice(0, 10)
      .map((j) => ({
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

  if (!result.ok) return jsonResponse({ ok: false, error: result.error }, 502);
  return jsonResponse({ ok: true, reply: result.reply });
};
