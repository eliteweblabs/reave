/**
 * GET  /api/clients/[uid]/crater — Crater customer link status for a contact
 * POST /api/clients/[uid]/crater — push contact to Crater (create or refresh match)
 */
import type { APIContext } from 'astro';
import { getContact, isContactApiConfigured } from '../../../../lib/contactApi';
import { getContactCraterStatus, pushContactToCrater } from '../../../../lib/contactCraterSync';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { hasFeature } from '../../../../lib/features';
import { isCraterConfigured } from '../../../../lib/craterClient';
import { jsonResponse } from '../../../../lib/apiResponse';

export const prerender = false;

function billingUnavailable(): Response {
  return jsonResponse({ ok: false, error: 'Crater billing is not configured' }, 404);
}

export async function GET(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }
  if (!hasFeature('billing') || !isCraterConfigured()) return billingUnavailable();

  const uid = context.params.uid?.trim() || '';
  if (!uid) return jsonResponse({ ok: false, error: 'uid required' }, 400);

  const contactRes = await getContact(uid);
  if (!contactRes.ok) {
    return jsonResponse(
      { ok: false, error: contactRes.error || 'Contact not found' },
      contactRes.status && contactRes.status >= 400 ? contactRes.status : 404,
    );
  }

  const status = await getContactCraterStatus(contactRes.data);
  return jsonResponse({ ok: true, uid, ...status });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;
  if (!isContactApiConfigured()) {
    return jsonResponse({ ok: false, error: 'CONTACT_API_BASE_URL is not configured' }, 503);
  }
  if (!hasFeature('billing') || !isCraterConfigured()) return billingUnavailable();

  const uid = context.params.uid?.trim() || '';
  if (!uid) return jsonResponse({ ok: false, error: 'uid required' }, 400);

  const contactRes = await getContact(uid);
  if (!contactRes.ok) {
    return jsonResponse(
      { ok: false, error: contactRes.error || 'Contact not found' },
      contactRes.status && contactRes.status >= 400 ? contactRes.status : 404,
    );
  }

  const pushed = await pushContactToCrater(contactRes.data, { updateIfExists: true });
  if (!pushed.ok) {
    const status =
      pushed.reason === 'missing_name'
        ? 400
        : pushed.reason === 'route_missing'
          ? 503
          : 502;
    return jsonResponse({ ok: false, error: pushed.error, reason: pushed.reason }, status);
  }

  return jsonResponse({
    ok: true,
    uid,
    created: pushed.created,
    alreadyInCrater: !pushed.created,
    synced: !pushed.created ? pushed.synced : undefined,
    customerId: pushed.customerId,
    customerName: pushed.customerName,
    adminUrl: pushed.adminUrl ?? null,
    message: pushed.created
      ? `Added ${pushed.customerName} to Crater`
      : pushed.synced
        ? `${pushed.customerName} is already in Crater — profile refreshed`
        : `${pushed.customerName} is already in Crater`,
  });
}
