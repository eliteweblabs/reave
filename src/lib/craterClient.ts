/**
 * Crater custom API client (eliteweblabs/crater-invoicing → routes/api-custom.php).
 *
 * The custom routes are mounted under `/api/openclaw/*` and authenticated with
 * the `X-OpenClaw-Token` header (matches Crater's OPENCLAW_API_TOKEN env).
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

async function craterFetch<T>(
  path: string,
  init: { method: string; body?: unknown }
): Promise<CraterResult<T>> {
  const base = baseUrl();
  const tok = token();
  if (!base) return { ok: false, error: 'CRATER_API_BASE_URL is not set' };
  if (!tok) return { ok: false, error: 'CRATER_API_TOKEN is not set' };

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-OpenClaw-Token': tok,
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
  return craterFetch<CreatedInvoice>('/api/openclaw/create-invoice', {
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
  q: string
): Promise<CraterResult<{ count: number; customers: CraterCustomer[] }>> {
  const query = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return craterFetch<{ count: number; customers: CraterCustomer[] }>(
    `/api/openclaw/customers${query}`,
    { method: 'GET' }
  );
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

export async function craterListInvoices(): Promise<
  CraterResult<{ count: number; invoices: CraterInvoiceSummary[] }>
> {
  return craterFetch<{ count: number; invoices: CraterInvoiceSummary[] }>(
    '/api/openclaw/invoices',
    { method: 'GET' }
  );
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
