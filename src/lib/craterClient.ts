/**
 * Crater custom API client (eliteweblabs/crater-invoicing → routes/api-custom.php).
 *
 * The custom routes are mounted under `/api/custom/*` and authenticated with
 * the `X-Crater-Api-Token` header (matches Crater's CRATER_API_TOKEN env).
 * Prices are sent in whole-dollar units; Crater stores cents internally.
 */
import { serverEnv } from './serverEnv';
import { clientNameSortKey, extractClientSearchTerms } from './clientSearch';

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
