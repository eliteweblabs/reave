/**
 * GET  /api/grand-opening/checkout?token=… — load checkout session
 * POST /api/grand-opening/checkout — create Crater invoice for selected add-ons
 */
import type { APIRoute } from 'astro';
import { checkInMemoryRateLimit } from '../../../lib/inMemoryRateLimit';
import { clientIp } from '../../../lib/clientIp';
import { jsonResponse, readJsonBody } from '../../../lib/apiResponse';
import {
  createGrandOpeningCheckoutInvoice,
  loadGrandOpeningCheckoutSession,
} from '../../../lib/grandOpeningCheckout';

export const GET: APIRoute = async ({ url, request }) => {
  const rate = checkInMemoryRateLimit(`go-checkout-get:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 60,
  });
  if (!rate.ok) {
    return jsonResponse({ ok: false, error: 'Too many requests' }, 429);
  }

  const token = url.searchParams.get('token')?.trim() ?? '';
  const session = await loadGrandOpeningCheckoutSession(token);
  if (!session) {
    return jsonResponse({ ok: false, error: 'Checkout session expired or invalid' }, 404);
  }

  return jsonResponse({ ok: true, session });
};

export const POST: APIRoute = async ({ request }) => {
  const rate = checkInMemoryRateLimit(`go-checkout-post:${clientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    maxPerWindow: 15,
  });
  if (!rate.ok) {
    return jsonResponse({ ok: false, error: 'Too many requests' }, 429);
  }

  const parsed = await readJsonBody(request);
  if (parsed instanceof Response) return parsed;
  const body = parsed.body;
  const token = String(body.token ?? '').trim();
  const selectedFeatures = Array.isArray(body.addons)
    ? body.addons.map((v: unknown) => String(v ?? '').trim()).filter(Boolean)
    : [];

  if (!token) return jsonResponse({ ok: false, error: 'Missing checkout token' }, 400);

  const result = await createGrandOpeningCheckoutInvoice({ tokenRaw: token, selectedFeatures });
  if (!result.ok) {
    const status =
      result.reason === 'billing_disabled'
        ? 503
        : result.reason === 'contact_missing'
          ? 404
          : 400;
    return jsonResponse({ ok: false, error: result.error, reason: result.reason }, status);
  }

  return jsonResponse({
    ok: true,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
    total: result.total,
    paymentUrl: result.paymentUrl,
    publicUrl: result.publicUrl,
  });
};
