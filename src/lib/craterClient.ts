/**
 * Crater custom API client (eliteweblabs/crater → routes/api-custom.php).
 *
 * The custom routes are mounted under `/api/custom/*` and authenticated with
 * the `X-Crater-Api-Token` header (matches Crater's CRATER_API_TOKEN env).
 * Prices are sent in whole-dollar units; Crater stores cents internally.
 */
import { serverEnv } from './serverEnv';
import { clientNameSortKey, extractClientSearchTerms, resolveContactEnhanced } from './clientSearch';

function baseUrl(): string | null {
  const raw = serverEnv('CRATER_API_BASE_URL')?.trim();
  if (!raw) return null;
  return raw.replace(/\/+$/, '');
}

function token(): string | null {
  return serverEnv('CRATER_API_TOKEN')?.trim() || null;
}

export function isCraterConfigured(): boolean {
  return Boolean(baseUrl() && token());
}

type CraterResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

type CraterFetchInit = {
  method: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
};

async function craterFetch<T>(path: string, init: CraterFetchInit): Promise<CraterResult<T>> {
  const base = baseUrl();
  const tok = token();
  if (!base) return { ok: false, error: 'CRATER_API_BASE_URL is not set' };
  if (!tok) return { ok: false, error: 'CRATER_API_TOKEN is not set' };

  let url = `${base}${path}`;
  if (init.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += (path.includes('?') ? '&' : '?') + qs;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method,
      headers: {
        Accept: 'application/json',
        ...(init.body != null ? { 'Content-Type': 'application/json' } : {}),
        'X-Crater-Api-Token': tok,
      },
      body: init.body != null ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // non-JSON response (e.g. HTML error page)
    }
  }

  if (!res.ok) {
    const parsedObj = parsed as { error?: string; message?: string; exception?: string } | undefined;
    let msg =
      parsedObj?.error ||
      parsedObj?.message ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
    if (
      res.status === 404 &&
      (!msg || msg.includes('NotFoundHttpException'))
    ) {
      msg = `Crater API route not found (${path}). Deploy the latest custom routes to Crater.`;
    }
    return { ok: false, error: msg, status: res.status };
  }

  return { ok: true, data: parsed as T };
}

export type CraterInvoiceItem = {
  name: string;
  description?: string;
  quantity: number;
  price: number;
};

export type CreateInvoiceInput = {
  customerName: string;
  customerEmail?: string;
  items: CraterInvoiceItem[];
  notes?: string;
  status?: 'DRAFT' | 'SENT' | 'VIEWED' | 'OVERDUE' | 'COMPLETED';
};

export type CreatedInvoice = {
  success: boolean;
  invoice_id: number;
  invoice_number: string;
  customer: string;
  total: number;
  admin_url?: string;
  public_url?: string;
  pdf_url?: string;
  payment_url?: string;
};

export async function craterCreateInvoice(
  input: CreateInvoiceInput
): Promise<CraterResult<CreatedInvoice>> {
  if (!input.customerName?.trim()) {
    return { ok: false, error: 'customerName is required' };
  }
  if (!input.items?.length) {
    return { ok: false, error: 'at least one line item is required' };
  }
  return craterFetch<CreatedInvoice>('/api/custom/create-invoice', {
    method: 'POST',
    body: {
      customer_name: input.customerName.trim(),
      customer_email: input.customerEmail?.trim() || undefined,
      items: input.items.map((i) => ({
        name: i.name,
        description: i.description ?? undefined,
        quantity: i.quantity,
        price: i.price,
      })),
      notes: input.notes ?? undefined,
      status: input.status ?? undefined,
    },
  });
}

export type CraterCustomer = {
  id: number;
  name: string;
  contact_name?: string;
  email?: string | null;
  phone?: string | null;
  invoice_summary?: { count: number; total_billed: number; total_paid?: number; total_due: number };
  estimate_summary?: { count: number; open: number; accepted: number };
};

export async function craterSearchCustomers(
  q: string,
  companyId?: number
): Promise<CraterResult<{ count: number; customers: CraterCustomer[] }>> {
  const res = await craterFetch<unknown>('/api/custom/customers', {
    method: 'GET',
    query: { q: q.trim() || undefined, company_id: companyId },
  });
  if (!res.ok) return res;
  // Crater's customers route returns `{ data: [...] }`, while the other custom
  // routes use `{ count, customers: [...] }`. Accept both shapes (and a bare
  // array) so backend schema drift can't silently zero out the customer list.
  const raw = res.data as
    | { customers?: unknown; data?: unknown }
    | unknown[]
    | null;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { customers?: unknown })?.customers)
      ? (raw as { customers: unknown[] }).customers
      : Array.isArray((raw as { data?: unknown })?.data)
        ? (raw as { data: unknown[] }).data
        : [];
  const customers: CraterCustomer[] = (list as Array<Record<string, unknown>>).map((c) => ({
    id: Number(c.id),
    name: String(c.name ?? ''),
    contact_name: (c.contact_name as string | undefined) ?? undefined,
    email: (c.email as string | null | undefined) ?? null,
    phone: (c.phone as string | null | undefined) ?? null,
    invoice_summary: c.invoice_summary as CraterCustomer['invoice_summary'],
    estimate_summary: c.estimate_summary as CraterCustomer['estimate_summary'],
  }));
  return { ok: true, data: { count: customers.length, customers } };
}

export async function craterUpdateCustomer(
  customerId: number,
  input: {
    name?: string;
    contact_name?: string;
    email?: string | null;
    phone?: string | null;
  },
): Promise<
  CraterResult<{
    success: boolean;
    customer_id: number;
    name: string;
    contact_name?: string | null;
    email?: string | null;
    phone?: string | null;
  }>
> {
  const id = Number(customerId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'customer_id is required' };

  const body: Record<string, string> = {};
  if (input.name?.trim()) body.name = input.name.trim();
  if (input.contact_name !== undefined) body.contact_name = input.contact_name.trim();
  if (input.email !== undefined) body.email = input.email?.trim() ?? '';
  if (input.phone !== undefined) body.phone = input.phone?.trim() ?? '';
  if (!Object.keys(body).length) return { ok: false, error: 'nothing to update' };

  return craterFetch(`/api/custom/customer/${encodeURIComponent(String(id))}`, {
    method: 'PUT',
    body,
  });
}

export type CraterInvoiceSummary = {
  id: number;
  invoice_number: string;
  customer_name?: string | null;
  invoice_date?: string | null;
  status: string;
  paid_status: string;
  total: number;
  due: number;
  public_url?: string | null;
};

export async function craterListInvoices(
  companyId?: number
): Promise<CraterResult<{ count: number; invoices: CraterInvoiceSummary[] }>> {
  return craterFetch<{ count: number; invoices: CraterInvoiceSummary[] }>('/api/custom/invoices', {
    method: 'GET',
    query: { company_id: companyId },
  });
}

export type CraterEstimateSummary = {
  id: number;
  estimate_number: string;
  customer_name?: string | null;
  estimate_date?: string | null;
  expiry_date?: string | null;
  status: string;
  total: number;
  public_url?: string | null;
};

const OPEN_ESTIMATE_STATUSES = new Set(['DRAFT', 'SENT', 'VIEWED']);

export async function craterListEstimates(
  companyId?: number
): Promise<CraterResult<{ count: number; estimates: CraterEstimateSummary[] }>> {
  return craterFetch<{ count: number; estimates: CraterEstimateSummary[] }>('/api/custom/estimates', {
    method: 'GET',
    query: { company_id: companyId },
  });
}

export type CraterInvoiceCounts = {
  outstanding: number;
  paid: number;
  totalDue: number;
};

export type CraterEstimateCounts = {
  open: number;
  accepted: number;
  total: number;
};

export type CraterBillingCounts = {
  invoices: CraterInvoiceCounts;
  estimates: CraterEstimateCounts;
};

/** Loose match for CRM ↔ Crater names (handles "The Solid Builder" vs "Solid Builders"). */
export function billingLabelsMatch(a: string, b: string): boolean {
  const na = clientNameSortKey(a).toLowerCase();
  const nb = clientNameSortKey(b).toLowerCase();
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.length >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function billingPhoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function billingPhonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const da = billingPhoneDigits(a);
  const db = billingPhoneDigits(b);
  if (da.length < 10 || db.length < 10) return false;
  const ta = da.slice(-10);
  const tb = db.slice(-10);
  return ta === tb;
}

/** Match a master contact to a Crater customer (email, phone, then fuzzy name/company). */
export function matchCraterCustomer(
  contact: { name: string; email?: string | null; company?: string | null; phone?: string | null },
  customers: CraterCustomer[],
): CraterCustomer | undefined {
  const email = (contact.email ?? '').trim().toLowerCase();
  if (email) {
    const byEmail = customers.find((c) => (c.email ?? '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  if (contact.phone) {
    const byPhone = customers.find((c) => billingPhonesMatch(contact.phone, c.phone));
    if (byPhone) return byPhone;
  }
  const labels: string[] = [];
  for (const raw of [contact.name, contact.company]) {
    const label = (raw ?? '').trim();
    if (label) labels.push(label);
  }
  for (const label of labels) {
    const byName = customers.find((c) => billingLabelsMatch(c.name, label));
    if (byName) return byName;
    const byContactName = customers.find((c) =>
      c.contact_name ? billingLabelsMatch(c.contact_name, label) : false,
    );
    if (byContactName) return byContactName;
  }
  return undefined;
}

/** Paid vs outstanding invoice counts keyed by Crater customer `name`. */
export function buildInvoiceCountsByCustomerName(
  invoices: CraterInvoiceSummary[],
): Map<string, CraterInvoiceCounts> {
  const map = new Map<string, CraterInvoiceCounts>();
  for (const inv of invoices) {
    const key = (inv.customer_name ?? '').trim().toLowerCase();
    if (!key) continue;
    const entry = map.get(key) ?? { outstanding: 0, paid: 0, totalDue: 0 };
    const due = Number(inv.due);
    if (due > 0) {
      entry.outstanding++;
      entry.totalDue += due;
    } else {
      entry.paid++;
    }
    map.set(key, entry);
  }
  return map;
}

/** Estimate counts keyed by Crater customer `name`. */
export function buildEstimateCountsByCustomerName(
  estimates: CraterEstimateSummary[],
): Map<string, CraterEstimateCounts> {
  const map = new Map<string, CraterEstimateCounts>();
  for (const est of estimates) {
    const key = (est.customer_name ?? '').trim().toLowerCase();
    if (!key) continue;
    const entry = map.get(key) ?? { open: 0, accepted: 0, total: 0 };
    entry.total++;
    const status = (est.status ?? '').toUpperCase();
    if (status === 'ACCEPTED') entry.accepted++;
    else if (OPEN_ESTIMATE_STATUSES.has(status)) entry.open++;
    map.set(key, entry);
  }
  return map;
}

export function buildBillingCountsByCustomerName(
  invoices: CraterInvoiceSummary[],
  estimates: CraterEstimateSummary[],
): Map<string, CraterBillingCounts> {
  const invMap = buildInvoiceCountsByCustomerName(invoices);
  const estMap = buildEstimateCountsByCustomerName(estimates);
  const keys = new Set([...invMap.keys(), ...estMap.keys()]);
  const map = new Map<string, CraterBillingCounts>();
  for (const key of keys) {
    map.set(key, {
      invoices: invMap.get(key) ?? { outstanding: 0, paid: 0, totalDue: 0 },
      estimates: estMap.get(key) ?? { open: 0, accepted: 0, total: 0 },
    });
  }
  return map;
}

function formatBillingHintParts(counts: CraterBillingCounts): string[] {
  const parts: string[] = [];
  const { invoices, estimates } = counts;

  if (invoices.outstanding > 0) {
    parts.push(
      `${invoices.outstanding} invoice${invoices.outstanding === 1 ? '' : 's'} outstanding`,
    );
  }
  if (invoices.paid > 0) {
    parts.push(`${invoices.paid} invoice${invoices.paid === 1 ? '' : 's'} paid`);
  }
  if (estimates.open > 0) {
    parts.push(`${estimates.open} estimate${estimates.open === 1 ? '' : 's'} open`);
  }
  if (estimates.accepted > 0) {
    parts.push(`${estimates.accepted} estimate${estimates.accepted === 1 ? '' : 's'} accepted`);
  }
  const otherEstimates = estimates.total - estimates.open - estimates.accepted;
  if (otherEstimates > 0) {
    parts.push(`${otherEstimates} estimate${otherEstimates === 1 ? '' : 's'}`);
  }

  return parts;
}

export type CraterBillingHint = {
  matched: boolean;
  craterCustomerId?: number;
  label: string;
  tone: 'none' | 'neutral' | 'paid' | 'due';
};

export function craterBillingHintForContact(
  contact: { name: string; email?: string | null },
  customers: CraterCustomer[],
  billingCounts: Map<string, CraterBillingCounts>,
): CraterBillingHint {
  const customer = matchCraterCustomer(contact, customers);
  if (!customer) {
    return { matched: false, label: 'Not in Crater', tone: 'none' };
  }

  const key = customer.name.trim().toLowerCase();
  const counts = billingCounts.get(key) ?? {
    invoices: { outstanding: 0, paid: 0, totalDue: 0 },
    estimates: { open: 0, accepted: 0, total: 0 },
  };
  const parts = formatBillingHintParts(counts);

  if (parts.length === 0) {
    return {
      matched: true,
      craterCustomerId: customer.id,
      label: 'In Crater · no billing',
      tone: 'neutral',
    };
  }

  return {
    matched: true,
    craterCustomerId: customer.id,
    label: parts.join(' · '),
    tone: counts.invoices.outstanding > 0 || counts.estimates.open > 0 ? 'due' : 'paid',
  };
}

export type CraterInvoiceDetail = {
  id: number;
  invoice_number: string;
  status: string;
  paid_status: string;
  total: number;
  due: number;
  notes?: string;
  customer?: { id: number; name: string; email?: string; phone?: string } | null;
  items?: Array<{
    id: number;
    name: string;
    description?: string;
    quantity: number;
    price: number;
    total: number;
  }>;
  admin_url?: string;
  public_url?: string | null;
  pdf_url?: string | null;
  payment_url?: string | null;
};

export async function craterGetInvoice(invoiceId: string | number): Promise<CraterResult<CraterInvoiceDetail>> {
  const id = String(invoiceId).trim();
  if (!id) return { ok: false, error: 'invoice_id is required' };
  return craterFetch<CraterInvoiceDetail>(`/api/custom/invoice/${encodeURIComponent(id)}`, {
    method: 'GET',
  });
}

export async function craterUpdateInvoice(
  invoiceId: string | number,
  input: {
    status?: 'DRAFT' | 'SENT' | 'VIEWED' | 'OVERDUE' | 'COMPLETED';
    due_date?: string;
    notes?: string;
  }
): Promise<CraterResult<{ success: boolean; invoice_id: number; status: string }>> {
  const id = String(invoiceId).trim();
  if (!id) return { ok: false, error: 'invoice_id is required' };
  return craterFetch<{ success: boolean; invoice_id: number; status: string }>(
    `/api/custom/invoice/${encodeURIComponent(id)}`,
    { method: 'PUT', body: input }
  );
}

export async function craterDeleteInvoice(
  invoiceId: string | number
): Promise<CraterResult<{ success: boolean; invoice_id: number; deleted: boolean }>> {
  const id = String(invoiceId).trim();
  if (!id) return { ok: false, error: 'invoice_id is required' };
  return craterFetch<{ success: boolean; invoice_id: number; deleted: boolean }>(
    `/api/custom/invoice/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
}

export async function craterAddInvoiceItems(
  invoiceId: string | number,
  items: CraterInvoiceItem[]
): Promise<
  CraterResult<{
    success: boolean;
    invoice_id: number;
    invoice_number: string;
    items_added: number;
    amount_added: number;
    new_total: number;
    new_due: number;
  }>
> {
  const id = String(invoiceId).trim();
  if (!id) return { ok: false, error: 'invoice_id is required' };
  if (!items.length) return { ok: false, error: 'at least one item is required' };
  return craterFetch(`/api/custom/invoice/${encodeURIComponent(id)}/items`, {
    method: 'POST',
    body: {
      items: items.map((i) => ({
        name: i.name,
        description: i.description ?? undefined,
        quantity: i.quantity,
        price: i.price,
      })),
    },
  });
}

export async function craterUpdateInvoiceItem(
  invoiceId: string | number,
  itemId: string | number,
  input: {
    name?: string;
    description?: string;
    quantity?: number;
    price?: number;
  }
): Promise<
  CraterResult<{
    success: boolean;
    item_id: number;
    invoice_id: number;
    name: string;
    description?: string;
    quantity: number;
    price: number;
    total: number;
  }>
> {
  const id = String(invoiceId).trim();
  const iid = String(itemId).trim();
  if (!id) return { ok: false, error: 'invoice_id is required' };
  if (!iid) return { ok: false, error: 'item_id is required' };
  const body: Record<string, unknown> = {};
  if (input.name?.trim()) body.name = input.name.trim();
  if (input.description !== undefined) body.description = input.description;
  if (input.quantity !== undefined) body.quantity = input.quantity;
  if (input.price !== undefined) body.price = input.price;
  if (!Object.keys(body).length) return { ok: false, error: 'nothing to update' };
  return craterFetch(
    `/api/custom/invoice/${encodeURIComponent(id)}/items/${encodeURIComponent(iid)}`,
    { method: 'PUT', body }
  );
}

export type CraterLineItem = {
  id: number;
  name: string;
  description?: string;
  price: number;
};

export async function craterSearchLineItems(
  q?: string,
  companyId?: number
): Promise<CraterResult<{ count: number; line_items: CraterLineItem[] }>> {
  return craterFetch<{ count: number; line_items: CraterLineItem[] }>('/api/custom/line-items', {
    method: 'GET',
    query: { q: q?.trim() || undefined, company_id: companyId },
  });
}

export type RecordPaymentInput = {
  customerName: string;
  amount: number;
  paymentMode?: string;
  paymentDate?: string;
  notes?: string;
  invoiceId?: number;
};

/**
 * Ask contact-api who this spoken/typed name is before Crater sees it.
 * Crater only does SQL LIKE, so "Pat Sullivan" would otherwise create a new
 * customer instead of matching "Patrick Sullivan".
 */
async function resolveCraterCustomerName(raw: string): Promise<
  { ok: true; customerName: string } | { ok: false; error: string; status: number }
> {
  const trimmed = raw.trim();
  const resolved = await resolveContactEnhanced({ name: trimmed });
  if (!resolved.ok) return { ok: true, customerName: trimmed };

  if ((resolved.match === 'exact' || resolved.match === 'likely') && resolved.contact?.name) {
    return { ok: true, customerName: resolved.contact.name };
  }

  if (resolved.match === 'possible') {
    if (resolved.candidates.length === 1 && resolved.candidates[0]?.name) {
      return { ok: true, customerName: resolved.candidates[0].name };
    }
    if (resolved.candidates.length > 1) {
      const names = resolved.candidates
        .map((c) => c.name?.trim())
        .filter(Boolean)
        .join(', ');
      return {
        ok: false,
        status: 300,
        error: `Multiple contacts matched "${trimmed}"${names ? `: ${names}` : ''}. Re-send with a more specific customer_name.`,
      };
    }
  }

  return { ok: true, customerName: trimmed };
}

export async function craterRecordPayment(
  input: RecordPaymentInput
): Promise<CraterResult<Record<string, unknown>>> {
  if (!input.customerName?.trim()) return { ok: false, error: 'customerName is required' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'amount must be a positive number' };
  }

  const resolved = await resolveCraterCustomerName(input.customerName);
  if (!resolved.ok) return resolved;

  const result = await craterFetch<Record<string, unknown>>('/api/custom/record-payment', {
    method: 'POST',
    body: {
      customer_name: resolved.customerName,
      amount: input.amount,
      payment_mode: input.paymentMode,
      payment_date: input.paymentDate,
      notes: input.notes,
      invoice_id: input.invoiceId,
    },
  });
  if (result.ok && result.data && typeof result.data === 'object') {
    return {
      ok: true,
      data: { ...result.data, customer_name: resolved.customerName },
    };
  }
  return result;
}

export type CraterRecurringInvoice = {
  id: number;
  status: string;
  customer?: { id: number; name: string } | null;
  total: number;
  frequency_human?: string;
  next_invoice_at?: string | null;
};

export async function craterListRecurringInvoices(
  status?: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED',
  companyId?: number
): Promise<CraterResult<{ count: number; recurring_invoices: CraterRecurringInvoice[] }>> {
  return craterFetch<{ count: number; recurring_invoices: CraterRecurringInvoice[] }>(
    '/api/custom/recurring-invoices',
    { method: 'GET', query: { status, company_id: companyId } }
  );
}

export async function craterCreateRecurringInvoice(input: {
  customerName: string;
  startsAt?: string;
  frequency?: string;
  sendAutomatically?: boolean;
}): Promise<
  CraterResult<{
    success: boolean;
    recurring_invoice_id: number;
    customer: string;
    starts_at: string;
    frequency: string;
  }>
> {
  if (!input.customerName?.trim()) return { ok: false, error: 'customerName is required' };
  return craterFetch('/api/custom/create-recurring-invoice', {
    method: 'POST',
    body: {
      customer_name: input.customerName.trim(),
      starts_at: input.startsAt,
      frequency: input.frequency,
      send_automatically: input.sendAutomatically,
    },
  });
}

export async function craterRepairInvoiceNumbers(input: {
  companyId?: number;
  dryRun?: boolean;
  only?: 'numbers' | 'totals' | 'all';
}): Promise<CraterResult<Record<string, unknown>>> {
  return craterFetch<Record<string, unknown>>('/api/custom/repair-invoice-numbers', {
    method: 'POST',
    body: {
      company_id: input.companyId,
      dry_run: input.dryRun ?? true,
      only: input.only ?? 'all',
    },
  });
}

export async function craterRepairPaymentNumbers(input: {
  companyId?: number;
  dryRun?: boolean;
}): Promise<CraterResult<Record<string, unknown>>> {
  return craterFetch<Record<string, unknown>>('/api/custom/repair-payment-numbers', {
    method: 'POST',
    body: {
      company_id: input.companyId,
      dry_run: input.dryRun ?? true,
    },
  });
}

export async function craterResetInvoices(input: {
  confirm: string;
  companyId?: number;
  dryRun?: boolean;
}): Promise<CraterResult<Record<string, unknown>>> {
  if (input.confirm !== 'YES_DELETE_EVERYTHING') {
    return { ok: false, error: 'confirm must be YES_DELETE_EVERYTHING' };
  }
  return craterFetch<Record<string, unknown>>('/api/custom/reset-invoices', {
    method: 'POST',
    body: {
      confirm: input.confirm,
      company_id: input.companyId,
      dry_run: input.dryRun ?? false,
    },
  });
}

export type BillingInvoice = {
  id: number;
  number: string;
  status: string;
  paidStatus: string;
  date: string | null;
  total: number;
  due: number;
  url: string | null;
};

export type UpcomingInvoice = {
  id: number;
  status: string;
  total: number;
  frequency: string | null;
  nextAt: string | null;
};

export type ClientBilling = {
  customerId: number;
  customerName: string;
  totalDue: number;
  /** Unpaid invoices (due > 0). */
  outstanding: BillingInvoice[];
  /** Settled/historical invoices (due <= 0). */
  previous: BillingInvoice[];
  /** Scheduled recurring invoices. */
  upcoming: UpcomingInvoice[];
};

export type CraterPaymentSummary = {
  id: number;
  paymentNumber: string;
  date: string | null;
  amount: number;
  method: string;
  invoiceId: number | null;
  invoiceNumber: string | null;
};

export type ClientPayments = {
  customerId: number;
  customerName: string;
  payments: CraterPaymentSummary[];
};

export type PortalBillingInvoiceGroup = {
  section: 'outstanding' | 'previous' | 'payments-only';
  invoice: BillingInvoice;
  payments: CraterPaymentSummary[];
};

export type PortalBillingView = {
  totalDue: number;
  upcoming: UpcomingInvoice[];
  outstandingGroups: PortalBillingInvoiceGroup[];
  previousGroups: PortalBillingInvoiceGroup[];
  paymentsOnlyGroups: PortalBillingInvoiceGroup[];
  orphanPayments: CraterPaymentSummary[];
};

function sortPaymentsNewestFirst(payments: CraterPaymentSummary[]): CraterPaymentSummary[] {
  return [...payments].sort(
    (a, b) => (Date.parse(b.date ?? '') || 0) - (Date.parse(a.date ?? '') || 0),
  );
}

/** Merge invoices and payments for the client portal billing tab. */
export function buildPortalBillingView(
  billing: ClientBilling | null,
  payments: CraterPaymentSummary[] | undefined,
): PortalBillingView | null {
  const payList = payments ?? [];
  const hasInvoices =
    (billing?.outstanding.length ?? 0) > 0 ||
    (billing?.previous.length ?? 0) > 0 ||
    (billing?.upcoming.length ?? 0) > 0;
  if (!hasInvoices && !payList.length) return null;

  const claimed = new Set<number>();
  const attachPayments = (
    section: PortalBillingInvoiceGroup['section'],
    invoice: BillingInvoice,
  ): PortalBillingInvoiceGroup => {
    const matched = payList.filter(
      (p) =>
        (p.invoiceId != null && p.invoiceId === invoice.id) ||
        (p.invoiceNumber &&
          p.invoiceNumber.replace(/^#/, '').trim() === invoice.number.trim()),
    );
    matched.forEach((p) => claimed.add(p.id));
    return { section, invoice, payments: sortPaymentsNewestFirst(matched) };
  };

  const outstandingGroups = (billing?.outstanding ?? []).map((invoice) =>
    attachPayments('outstanding', invoice),
  );
  const previousGroups = (billing?.previous ?? []).map((invoice) =>
    attachPayments('previous', invoice),
  );

  const paymentsOnlyGroups: PortalBillingInvoiceGroup[] = [];
  const byKey = new Map<string, CraterPaymentSummary[]>();
  for (const p of payList) {
    if (claimed.has(p.id)) continue;
    const key =
      p.invoiceId != null
        ? `id:${p.invoiceId}`
        : p.invoiceNumber
          ? `num:${p.invoiceNumber.replace(/^#/, '').trim()}`
          : '';
    if (!key) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(p);
    byKey.set(key, arr);
  }

  for (const [key, pays] of byKey) {
    for (const p of pays) claimed.add(p.id);
    const sorted = sortPaymentsNewestFirst(pays);
    const number =
      key.startsWith('num:')
        ? key.slice(4)
        : sorted[0].invoiceNumber?.replace(/^#/, '').trim() || '—';
    const id = key.startsWith('id:') ? Number(key.slice(3)) : sorted[0].invoiceId ?? 0;
    paymentsOnlyGroups.push({
      section: 'payments-only',
      invoice: {
        id,
        number,
        status: 'PAID',
        paidStatus: 'PAID',
        date: sorted[0].date,
        total: sorted.reduce((sum, p) => sum + p.amount, 0),
        due: 0,
        url: null,
      },
      payments: sorted,
    });
  }

  const orphanPayments = sortPaymentsNewestFirst(
    payList.filter((p) => !claimed.has(p.id) && p.invoiceId == null && !p.invoiceNumber),
  );

  return {
    totalDue: billing?.totalDue ?? 0,
    upcoming: billing?.upcoming ?? [],
    outstandingGroups,
    previousGroups,
    paymentsOnlyGroups,
    orphanPayments,
  };
}

export type CraterContactMatch = {
  email?: string;
  name?: string;
  company?: string;
  phone?: string;
};

function collectBillingSearchTerms(input: CraterContactMatch): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();
  const push = (raw?: string) => {
    const t = raw?.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    terms.push(t);
  };

  push(input.email);
  for (const part of extractClientSearchTerms(input.name ?? '')) push(part);
  push(input.company);
  if (input.company) push(clientNameSortKey(input.company));

  const digits = billingPhoneDigits(input.phone);
  if (digits.length >= 10) push(digits.slice(-10));

  return terms;
}

/**
 * Resolve a Crater customer for a contact by email, name, and/or company.
 *
 * Crater's `/customers?q=` search only matches against whatever single query
 * string it's given, so a contact filed in Crater under just their company
 * name (no email on file, or a different invoicing email) would never be
 * found if we only ever searched by email. Try email first (more precise),
 * then fall back to separate searches by name and company — otherwise the
 * portal's Billing tab silently disappears for any contact whose CRM email
 * doesn't happen to match their Crater record.
 */
export async function craterFindCustomerForContact(
  input: CraterContactMatch,
): Promise<CraterResult<CraterCustomer | undefined>> {
  const email = input.email?.trim().toLowerCase() || '';
  const name = input.name?.trim() || '';
  const company = input.company?.trim() || '';
  const phone = input.phone?.trim() || '';
  if (!email && !name && !company && !phone) {
    return { ok: false, error: 'email, name, company, or phone is required' };
  }

  const contact = { name: name || company, email, company, phone };
  const searchTerms = collectBillingSearchTerms(input);

  const seenIds = new Set<number>();
  const pooled: CraterCustomer[] = [];

  for (const term of searchTerms) {
    const res = await craterSearchCustomers(term);
    if (!res.ok) return res;
    const batch = res.data?.customers ?? [];
    const match = matchCraterCustomer(contact, batch);
    if (match) return { ok: true, data: match };
    for (const customer of batch) {
      if (!seenIds.has(customer.id)) {
        seenIds.add(customer.id);
        pooled.push(customer);
      }
    }
  }

  return { ok: true, data: matchCraterCustomer(contact, pooled) };
}

/**
 * Resolve a Crater customer for a contact (prefer email match, else name) and
 * return their full billing picture: outstanding (unpaid) + previous (paid)
 * invoices with public links, plus upcoming recurring invoices.
 * Returns ok:true with data:null when no matching customer is found.
 */
export async function craterGetClientBilling(input: CraterContactMatch): Promise<CraterResult<ClientBilling | null>> {
  const email = input.email?.trim().toLowerCase() || '';
  const name = input.name?.trim() || '';
  const company = input.company?.trim() || '';
  const phone = input.phone?.trim() || '';
  if (!email && !name && !company && !phone) {
    return { ok: false, error: 'email, name, company, or phone is required' };
  }

  const found = await craterFindCustomerForContact(input);
  if (!found.ok) return { ok: false, error: found.error, status: found.status };
  const customer = found.data;
  if (!customer) return { ok: true, data: null };

  const customerLabel = customer.name.trim();
  const matchesCustomer = (n?: string | null) =>
    n ? billingLabelsMatch(customerLabel, n) : false;

  const list = await craterListInvoices();
  const mine = list.ok ? (list.data?.invoices ?? []).filter((inv) => matchesCustomer(inv.customer_name)) : [];
  const toInvoice = (inv: CraterInvoiceSummary): BillingInvoice => ({
    id: inv.id,
    number: inv.invoice_number,
    status: inv.status,
    paidStatus: inv.paid_status,
    date: inv.invoice_date ?? null,
    total: Number(inv.total),
    due: Number(inv.due),
    url: inv.public_url ?? null,
  });
  const outstanding = mine.filter((inv) => Number(inv.due) > 0).map(toInvoice);
  const previous = mine.filter((inv) => Number(inv.due) <= 0).map(toInvoice);

  // Prefer the customer summary's total_due, but fall back to summing the
  // outstanding invoices (the customers route no longer returns invoice_summary).
  const totalDue =
    customer.invoice_summary?.total_due != null
      ? Number(customer.invoice_summary.total_due)
      : outstanding.reduce((sum, inv) => sum + inv.due, 0);

  const recurring = await craterListRecurringInvoices();
  const upcoming = recurring.ok
    ? (recurring.data?.recurring_invoices ?? [])
        .filter((r) => matchesCustomer(r.customer?.name))
        .map((r) => ({
          id: r.id,
          status: r.status,
          total: Number(r.total),
          frequency: r.frequency_human ?? null,
          nextAt: r.next_invoice_at ?? null,
        }))
    : [];

  return {
    ok: true,
    data: { customerId: customer.id, customerName: customer.name, totalDue, outstanding, previous, upcoming },
  };
}

type CraterPaymentRow = {
  id: number;
  payment_number: string;
  payment_date?: string | null;
  amount: number;
  invoice_id?: number | null;
  invoice_number?: string | null;
  payment_method?: string | null;
};

export async function craterListPayments(input?: {
  customerId?: number;
  q?: string;
  companyId?: number;
}): Promise<CraterResult<{ count: number; payments: CraterPaymentSummary[] }>> {
  const res = await craterFetch<{ count: number; payments: CraterPaymentRow[] }>('/api/custom/payments', {
    method: 'GET',
    query: {
      company_id: input?.companyId,
      customer_id: input?.customerId,
      q: input?.q?.trim() || undefined,
    },
  });
  if (!res.ok) return res;
  const payments = (res.data?.payments ?? []).map((p) => ({
    id: p.id,
    paymentNumber: p.payment_number,
    date: p.payment_date ?? null,
    amount: Number(p.amount),
    method: p.payment_method?.trim() || 'Other',
    invoiceId: p.invoice_id ?? null,
    invoiceNumber: p.invoice_number ?? null,
  }));
  return { ok: true, data: { count: payments.length, payments } };
}

/**
 * Payment history for a contact-matched Crater customer.
 * Returns ok:true with data:null when no matching customer is found.
 */
export async function craterGetClientPayments(input: CraterContactMatch): Promise<CraterResult<ClientPayments | null>> {
  const email = input.email?.trim().toLowerCase() || '';
  const name = input.name?.trim() || '';
  const company = input.company?.trim() || '';
  const phone = input.phone?.trim() || '';
  if (!email && !name && !company && !phone) {
    return { ok: false, error: 'email, name, company, or phone is required' };
  }

  const found = await craterFindCustomerForContact(input);
  if (!found.ok) return { ok: false, error: found.error, status: found.status };
  const customer = found.data;
  if (!customer) return { ok: true, data: null };

  const list = await craterListPayments({ customerId: customer.id });
  if (!list.ok) return { ok: false, error: list.error, status: list.status };

  return {
    ok: true,
    data: {
      customerId: customer.id,
      customerName: customer.name,
      payments: list.data.payments,
    },
  };
}

export type BillingDashboardStats = {
  outstandingCount: number;
  overdueCount: number;
  totalDue: number;
  recurringActive: number;
};

/** Org-wide billing snapshot for the admin dashboard. */
export async function craterBillingDashboardStats(): Promise<CraterResult<BillingDashboardStats>> {
  const [invoicesRes, recurringRes] = await Promise.all([
    craterListInvoices(),
    craterListRecurringInvoices('ACTIVE'),
  ]);
  if (!invoicesRes.ok) return invoicesRes;

  let outstandingCount = 0;
  let overdueCount = 0;
  let totalDue = 0;

  for (const inv of invoicesRes.data.invoices ?? []) {
    const due = Number(inv.due);
    if (due > 0) {
      outstandingCount++;
      totalDue += due;
    }
    if ((inv.status ?? '').toUpperCase() === 'OVERDUE') overdueCount++;
  }

  return {
    ok: true,
    data: {
      outstandingCount,
      overdueCount,
      totalDue,
      recurringActive: recurringRes.ok ? (recurringRes.data.recurring_invoices ?? []).length : 0,
    },
  };
}

export type CreateExpenseInput = {
  amount: number;
  expenseDate?: string;
  categoryName?: string;
  notes?: string;
};

export type CreatedExpense = {
  success: boolean;
  expense_id: number;
  amount: number;
  expense_date: string;
  category: string;
  admin_url?: string;
};

export async function craterCreateExpense(
  input: CreateExpenseInput,
): Promise<CraterResult<CreatedExpense>> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'amount must be a positive number' };
  }
  return craterFetch<CreatedExpense>('/api/custom/create-expense', {
    method: 'POST',
    body: {
      amount: input.amount,
      expense_date: input.expenseDate,
      category_name: input.categoryName,
      notes: input.notes,
    },
  });
}

/** Format a created invoice for display/API response. */
export function formatCreatedInvoice(inv: CreatedInvoice): string {
  const lines = [
    'Created!',
    `Invoice #: ${inv.invoice_number}`,
    `Customer: ${inv.customer}`,
    `Amount: $${Number(inv.total).toFixed(2)}`,
  ];
  if (inv.public_url) lines.push(`Link: ${inv.public_url}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Payment update / delete (custom routes from crater-payment-update.route.php
// and crater-payment-delete.route.php in eliteweblabs/crater)
// ---------------------------------------------------------------------------

export type UpdatePaymentInput = {
  paymentId: number;
  paymentMethod?: string;
  paymentDate?: string;
  notes?: string;
  amount?: number; // whole dollars
};

export type UpdatedPayment = {
  success: boolean;
  payment_id: number;
  payment_number: string;
  payment_method: string;
  payment_date: string;
  notes?: string | null;
  amount: number;
  invoice_id: number;
};

export async function craterUpdatePayment(
  input: UpdatePaymentInput
): Promise<CraterResult<UpdatedPayment>> {
  if (!Number.isInteger(input.paymentId) || input.paymentId <= 0) {
    return { ok: false, error: 'paymentId must be a positive integer' };
  }
  const body: Record<string, unknown> = {};
  if (input.paymentMethod !== undefined) body.payment_method = input.paymentMethod;
  if (input.paymentDate !== undefined) body.payment_date = input.paymentDate;
  if (input.notes !== undefined) body.notes = input.notes;
  if (input.amount !== undefined) body.amount = input.amount;
  return craterFetch<UpdatedPayment>(`/api/custom/payment/${input.paymentId}`, {
    method: 'PUT',
    body,
  });
}

export type DeletedPayment = {
  success: boolean;
  deleted_id: number;
  payment_number: string;
  invoice_id: number;
  amount: number;
  message: string;
};

export async function craterDeletePayment(
  paymentId: number
): Promise<CraterResult<DeletedPayment>> {
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return { ok: false, error: 'paymentId must be a positive integer' };
  }
  return craterFetch<DeletedPayment>(`/api/custom/payment/${paymentId}`, {
    method: 'DELETE',
  });
}
