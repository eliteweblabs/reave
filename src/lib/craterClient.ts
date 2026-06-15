/**
 * Crater custom API client (eliteweblabs/crater-invoicing → routes/api-custom.php).
 *
 * The custom routes are mounted under `/api/custom/*` and authenticated with
 * the `X-Crater-Api-Token` header (matches Crater's CRATER_API_TOKEN env).
 * Prices are sent in whole-dollar units; Crater stores cents internally.
 */
import { serverEnv } from './serverEnv';

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
    const msg =
      (parsed as { error?: string; message?: string })?.error ||
      (parsed as { message?: string })?.message ||
      text.slice(0, 200) ||
      `HTTP ${res.status}`;
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
  invoice_summary?: { count: number; total_billed: number; total_due: number };
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
  }));
  return { ok: true, data: { count: customers.length, customers } };
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
  paymentMode?: 'CASH' | 'CHECK' | 'CREDIT_CARD' | 'BANK_TRANSFER' | 'OTHER';
  paymentDate?: string;
  notes?: string;
  invoiceId?: number;
};

export async function craterRecordPayment(
  input: RecordPaymentInput
): Promise<CraterResult<Record<string, unknown>>> {
  if (!input.customerName?.trim()) return { ok: false, error: 'customerName is required' };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ok: false, error: 'amount must be a positive number' };
  }
  return craterFetch<Record<string, unknown>>('/api/custom/record-payment', {
    method: 'POST',
    body: {
      customer_name: input.customerName.trim(),
      amount: input.amount,
      payment_mode: input.paymentMode,
      payment_date: input.paymentDate,
      notes: input.notes,
      invoice_id: input.invoiceId,
    },
  });
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

/**
 * Resolve a Crater customer for a contact (prefer email match, else name) and
 * return their full billing picture: outstanding (unpaid) + previous (paid)
 * invoices with public links, plus upcoming recurring invoices.
 * Returns ok:true with data:null when no matching customer is found.
 */
export async function craterGetClientBilling(input: {
  email?: string;
  name?: string;
}): Promise<CraterResult<ClientBilling | null>> {
  const email = input.email?.trim().toLowerCase() || '';
  const name = input.name?.trim() || '';
  if (!email && !name) return { ok: false, error: 'email or name is required' };

  const search = await craterSearchCustomers(email || name);
  if (!search.ok) return { ok: false, error: search.error, status: search.status };

  const customers = search.data.customers ?? [];
  let customer: CraterCustomer | undefined;
  if (email) {
    customer = customers.find((c) => (c.email ?? '').trim().toLowerCase() === email);
  }
  if (!customer && name) {
    customer = customers.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
  }
  if (!customer) customer = customers[0];
  if (!customer) return { ok: true, data: null };

  const matchesCustomer = (n?: string | null) =>
    (n ?? '').trim().toLowerCase() === customer!.name.trim().toLowerCase();

  const list = await craterListInvoices();
  const mine = list.ok ? (list.data.invoices ?? []).filter((inv) => matchesCustomer(inv.customer_name)) : [];
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
    ? (recurring.data.recurring_invoices ?? [])
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

/** Format a created invoice for a Telegram reply. */
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
