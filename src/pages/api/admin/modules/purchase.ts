/**
 * POST /api/admin/modules/purchase
 *
 * Clients buy or request a paid module. They cannot enable it.
 * - action: purchase — invoice via Crater when billing is live, else request
 * - action: mark_paid — deployment owner only, after the card clears
 */
import type { APIContext } from 'astro';
import { requireDashboardUser } from '../../../../lib/dashboardAuth';
import { requireDeploymentOwner } from '../../../../lib/deploymentOwner';
import { getCompanyConfig } from '../../../../lib/companyConfig';
import { isDemoMode } from '../../../../lib/demoMode';
import { hasFeature } from '../../../../lib/features';
import { FEATURE_LABELS, isPrivateFeature } from '../../../../lib/featureCatalog';
import { isCraterConfigured, craterCreateInvoice } from '../../../../lib/craterClient';
import { postToSystemAlertsThread } from '../../../../lib/adminAgentAlert';
import {
  formatModulePrice,
  isPaidModule,
  modulePrice,
  moduleStorefrontEnabled,
} from '../../../../lib/moduleStorefront';
import {
  getModuleEntitlement,
  isFeatureId,
  upsertModuleEntitlement,
} from '../../../../lib/moduleEntitlements';

export const prerender = false;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function POST(context: APIContext): Promise<Response> {
  const auth = await requireDashboardUser(context);
  if (auth instanceof Response) return auth;

  if (isDemoMode()) {
    return json({ ok: false, error: 'Module purchases are disabled in demo mode.' }, 400);
  }
  if (!moduleStorefrontEnabled()) {
    return json({ ok: false, error: 'This official install does not sell modules to itself.' }, 400);
  }

  let body: Record<string, unknown>;
  try {
    body = (await context.request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const action = String(body.action ?? 'purchase').trim();
  const featureRaw = String(body.feature ?? '').trim();
  if (!isFeatureId(featureRaw)) return json({ ok: false, error: 'Unknown module.' }, 400);
  if (isPrivateFeature(featureRaw) || !isPaidModule(featureRaw)) {
    return json({ ok: false, error: 'That module is not for sale in the app.' }, 400);
  }
  if (hasFeature(featureRaw)) {
    return json({ ok: false, error: 'This module is already on for this install.' }, 400);
  }

  const price = modulePrice(featureRaw);
  if (!price) return json({ ok: false, error: 'No price on file.' }, 400);
  const label = FEATURE_LABELS[featureRaw];

  if (action === 'mark_paid') {
    const owner = await requireDeploymentOwner(context);
    if (owner instanceof Response) return owner;
    const entitlement = await upsertModuleEntitlement({
      feature: featureRaw,
      status: 'paid',
      amount: price.amount,
      notes: 'Marked paid by deployment owner. Enable features[] on the next deploy.',
    });
    await postToSystemAlertsThread({
      message: `Module paid: ${label} (\`${featureRaw}\`). Turn it on in this install’s features[] and footer nav, then set moduleStatus to deployed.`,
      bypassSleep: true,
      push: {
        title: `Paid: ${label}`,
        body: 'Activate the module on this install.',
        url: '/admin/?tab=modules',
        urgent: true,
      },
    }).catch(() => undefined);
    return json({ ok: true, entitlement, activated: false });
  }

  if (action !== 'purchase' && action !== 'request') {
    return json({ ok: false, error: 'Unknown action' }, 400);
  }

  const existing = await getModuleEntitlement(featureRaw);
  if (existing?.status === 'paid') {
    return json({ ok: true, entitlement: existing, alreadyPaid: true });
  }
  if (existing?.status === 'invoiced' && existing.invoiceUrl) {
    return json({ ok: true, entitlement: existing, resume: true });
  }

  const company = await getCompanyConfig(context.request);
  const customerEmail = company.supportEmail || company.fromEmail || undefined;
  let invoiceUrl: string | null = null;
  let invoiceId: string | null = null;
  let invoiceNumber: string | null = null;
  let status: 'requested' | 'invoiced' = 'requested';
  let invoiceError: string | null = null;

  if (isCraterConfigured() && action === 'purchase') {
    const created = await craterCreateInvoice({
      customerName: company.name || 'Module purchase',
      customerEmail,
      status: 'SENT',
      notes: `${label} add-on — first month. Recurring ${formatModulePrice(price)} after we turn it on. Clients cannot enable modules themselves.`,
      items: [
        {
          name: `${label} (first month)`,
          description: `REΛVE add-on · ${featureRaw} · ${formatModulePrice(price)}`,
          quantity: 1,
          price: price.amount,
        },
      ],
    });
    if (created.ok) {
      status = 'invoiced';
      invoiceId = String(created.data.invoice_id);
      invoiceNumber = created.data.invoice_number;
      invoiceUrl = created.data.payment_url || created.data.public_url || null;
    } else {
      invoiceError = created.error;
    }
  }

  const entitlement = await upsertModuleEntitlement({
    feature: featureRaw,
    status,
    amount: price.amount,
    invoiceId,
    invoiceNumber,
    invoiceUrl,
    notes:
      status === 'invoiced'
        ? 'Invoice sent. Activate after payment.'
        : invoiceError
          ? `Request logged (invoice failed: ${invoiceError}). Call to pay.`
          : 'Request logged. Call to pay by card, or we will send an invoice.',
  });

  await postToSystemAlertsThread({
    message:
      status === 'invoiced'
        ? `Module invoice: ${label} (\`${featureRaw}\`) ${formatModulePrice(price)}${invoiceNumber ? ` · ${invoiceNumber}` : ''}${invoiceUrl ? ` · ${invoiceUrl}` : ''}. Do not enable until it is paid.`
        : `Module request: ${label} (\`${featureRaw}\`) ${formatModulePrice(price)}. No in-app invoice${invoiceError ? ` (${invoiceError})` : ''}. Call them for a card, then enable features[] after payment.`,
    bypassSleep: true,
    push: {
      title: status === 'invoiced' ? `Invoice: ${label}` : `Request: ${label}`,
      body: `${company.name} · ${formatModulePrice(price)}`,
      url: '/admin/?tab=modules',
      urgent: true,
    },
  }).catch(() => undefined);

  return json({
    ok: true,
    entitlement,
    checkoutUrl: invoiceUrl,
    invoiced: status === 'invoiced',
    invoiceError,
  });
}
