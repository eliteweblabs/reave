/**
 * Grand opening checkout — signed post-intake sessions and Crater invoices.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { clerkSecretKey } from './clerkClient';
import { getContact, type ContactRecord } from './contactApi';
import { pushContactToCrater } from './contactCraterSync';
import { craterCreateInvoice, isCraterConfigured, type CraterInvoiceItem } from './craterClient';
import { hasFeature } from './features';
import { FEATURE_LABELS, type FeatureId } from './featureCatalog';
import { catalogBlurb, catalogLabel, resolvedModulePrice } from './moduleCatalogOverlay';
import { ensureModuleCatalogLoaded } from './moduleCatalogStore';
import { formatModulePrice } from './moduleStorefront';
import { listGrandOpeningModules } from './grandOpeningCatalog';
import { storeReadWork, storeWriteWork } from './workStore';

export const GRAND_OPENING_HOSTING_LINE = {
  name: 'Grand opening — one year managed hosting',
  description:
    'One year of managed hosting plus custom website design at no extra charge (subject to approval).',
  amount: 500,
} as const;

export type GrandOpeningCheckoutToken = {
  contactUid: string;
  jobSlug: string;
  email: string;
  exp: number;
};

export type GrandOpeningCheckoutAddon = {
  feature: string;
  label: string;
  blurb: string;
  priceLabel: string;
  amount: number;
};

export type GrandOpeningCheckoutSession = {
  contactUid: string;
  jobSlug: string;
  contactName: string;
  company: string | null;
  email: string;
  base: typeof GRAND_OPENING_HOSTING_LINE;
  addons: GrandOpeningCheckoutAddon[];
  billingConfigured: boolean;
};

export type GrandOpeningInvoiceResult =
  | {
      ok: true;
      invoiceId: number;
      invoiceNumber: string;
      total: number;
      paymentUrl: string | null;
      publicUrl: string | null;
    }
  | { ok: false; error: string; reason?: 'billing_disabled' | 'invalid_addons' | 'contact_missing' };

const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function sealSecret(): string {
  return clerkSecretKey() || 'grand-opening-checkout-dev';
}

export function sealGrandOpeningCheckoutToken(
  input: Omit<GrandOpeningCheckoutToken, 'exp'> & { exp?: number },
): string {
  const payload: GrandOpeningCheckoutToken = {
    contactUid: input.contactUid.trim(),
    jobSlug: input.jobSlug.trim(),
    email: input.email.trim().toLowerCase(),
    exp: input.exp ?? Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', sealSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function openGrandOpeningCheckoutToken(raw: string | null | undefined): GrandOpeningCheckoutToken | null {
  const value = raw?.trim();
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac('sha256', sealSecret()).update(body).digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as GrandOpeningCheckoutToken;
    if (!payload?.contactUid || !payload?.jobSlug || !payload?.email || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function grandOpeningCheckoutUrl(token: string): string {
  return `/grand-opening/checkout?token=${encodeURIComponent(token)}`;
}

export async function listGrandOpeningCheckoutAddons(): Promise<GrandOpeningCheckoutAddon[]> {
  await ensureModuleCatalogLoaded();
  const mods = listGrandOpeningModules();
  const addons: GrandOpeningCheckoutAddon[] = [];
  for (const mod of mods) {
    const feature = mod.feature as FeatureId;
    const price = resolvedModulePrice(feature);
    if (!price || price.amount <= 0) continue;
    addons.push({
      feature: mod.feature,
      label: catalogLabel(feature, mod.label),
      blurb: catalogBlurb(feature, mod.blurb),
      priceLabel: formatModulePrice(price),
      amount: price.amount,
    });
  }
  return addons;
}

export async function loadGrandOpeningCheckoutSession(
  tokenRaw: string,
): Promise<GrandOpeningCheckoutSession | null> {
  const token = openGrandOpeningCheckoutToken(tokenRaw);
  if (!token) return null;

  const contactRes = await getContact(token.contactUid);
  if (!contactRes.ok) return null;
  const contact = contactRes.data;

  const addons = await listGrandOpeningCheckoutAddons();
  return {
    contactUid: token.contactUid,
    jobSlug: token.jobSlug,
    contactName: String(contact.name || '').trim() || 'Applicant',
    company: String(contact.company || '').trim() || null,
    email: token.email,
    base: GRAND_OPENING_HOSTING_LINE,
    addons,
    billingConfigured: hasFeature('billing') && isCraterConfigured(),
  };
}

function invoiceItemsForSelection(
  addons: GrandOpeningCheckoutAddon[],
  selectedFeatures: string[],
): CraterInvoiceItem[] {
  const byFeature = new Map(addons.map((a) => [a.feature, a]));
  const items: CraterInvoiceItem[] = [
    {
      name: GRAND_OPENING_HOSTING_LINE.name,
      description: GRAND_OPENING_HOSTING_LINE.description,
      quantity: 1,
      price: GRAND_OPENING_HOSTING_LINE.amount,
    },
  ];
  for (const feature of selectedFeatures) {
    const addon = byFeature.get(feature);
    if (!addon) continue;
    items.push({
      name: addon.label,
      description: addon.blurb || `${FEATURE_LABELS[feature as FeatureId] ?? feature} add-on`,
      quantity: 1,
      price: addon.amount,
    });
  }
  return items;
}

async function appendInvoiceNoteToWork(jobSlug: string, note: string): Promise<void> {
  const doc = await storeReadWork(jobSlug);
  if (!doc) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const block = `\n\n---\n\n**Checkout invoice (${stamp})**\n\n${note}`;
  await storeWriteWork(jobSlug, {
    ...doc,
    body: `${doc.body || ''}${block}`.trim(),
  });
}

export async function createGrandOpeningCheckoutInvoice(opts: {
  tokenRaw: string;
  selectedFeatures: string[];
}): Promise<GrandOpeningInvoiceResult> {
  if (!hasFeature('billing') || !isCraterConfigured()) {
    return { ok: false, error: 'Crater billing is not configured', reason: 'billing_disabled' };
  }

  const token = openGrandOpeningCheckoutToken(opts.tokenRaw);
  if (!token) return { ok: false, error: 'Checkout session expired or invalid' };

  const contactRes = await getContact(token.contactUid);
  if (!contactRes.ok) return { ok: false, error: 'Contact not found', reason: 'contact_missing' };

  const addons = await listGrandOpeningCheckoutAddons();
  const allowed = new Set(addons.map((a) => a.feature));
  const selected = [...new Set(opts.selectedFeatures.map((f) => f.trim()).filter(Boolean))];
  if (selected.some((f) => !allowed.has(f))) {
    return { ok: false, error: 'Invalid add-on selection', reason: 'invalid_addons' };
  }

  const contact: ContactRecord = contactRes.data;
  const craterPush = await pushContactToCrater(contact, { updateIfExists: true });
  if (!craterPush.ok && craterPush.reason !== 'billing_disabled') {
    console.warn('[grandOpeningCheckout] Crater customer sync:', craterPush.error);
  }

  const customerName =
    String(contact.company || '').trim() || String(contact.name || '').trim() || 'Grand opening applicant';
  const items = invoiceItemsForSelection(addons, selected);
  const addonSummary = selected.length
    ? selected.map((f) => addons.find((a) => a.feature === f)?.label ?? f).join(', ')
    : 'None';

  const created = await craterCreateInvoice({
    customerName,
    customerEmail: token.email || String(contact.email || '').trim() || undefined,
    status: 'SENT',
    notes: [
      'Grand opening offer checkout.',
      `Project: ${token.jobSlug}`,
      `Add-ons: ${addonSummary}`,
      'Website design included with one-year hosting purchase.',
    ].join('\n'),
    items,
  });

  if (!created.ok) return { ok: false, error: created.error };

  const paymentUrl = created.data.payment_url || created.data.public_url || null;
  const lines = [
    `Invoice **${created.data.invoice_number}** · $${created.data.total}`,
    paymentUrl ? `Pay: ${paymentUrl}` : '',
    addonSummary !== 'None' ? `Add-ons: ${addonSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  void appendInvoiceNoteToWork(token.jobSlug, lines);

  return {
    ok: true,
    invoiceId: created.data.invoice_id,
    invoiceNumber: created.data.invoice_number,
    total: created.data.total,
    paymentUrl,
    publicUrl: created.data.public_url ?? null,
  };
}
