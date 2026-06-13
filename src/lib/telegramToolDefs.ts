/**
 * Telegram assistant tool definitions (JSON schema) and dispatch.
 * Single source of truth for buildTools / runTool.
 */
import { listKnowledgeSlugs, readKnowledgeMarkdown, summarizeKnowledgeIndex } from './localKnowledge';
import { isContactApiConfigured, resolveContact } from './contactApi';
import {
  isCraterConfigured,
  craterCreateInvoice,
  craterSearchCustomers,
  craterListInvoices,
  craterGetInvoice,
  craterUpdateInvoice,
  craterDeleteInvoice,
  craterAddInvoiceItems,
  craterSearchLineItems,
  craterRecordPayment,
  craterListRecurringInvoices,
  craterCreateRecurringInvoice,
  craterRepairInvoiceNumbers,
  craterRepairPaymentNumbers,
  craterResetInvoices,
} from './craterClient';
import { DEV_TASK_NAMES, isDevTaskName, runDevTask } from './devTaskRunner';

export type TelegramToolDef = {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

const INVOICE_STATUS_ENUM = ['DRAFT', 'SENT', 'VIEWED', 'OVERDUE', 'COMPLETED'] as const;
const PAYMENT_MODE_ENUM = ['CASH', 'CHECK', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER'] as const;
const RECURRING_STATUS_ENUM = ['ACTIVE', 'ON_HOLD', 'COMPLETED'] as const;

const lineItemSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Line item name' },
    description: { type: 'string' },
    quantity: { type: 'number', description: 'Defaults to 1 if omitted' },
    price: { type: 'number', description: 'Unit price in whole dollars' },
  },
  required: ['name', 'price'],
  additionalProperties: false,
};

export function buildTools(): TelegramToolDef[] {
  const base: TelegramToolDef[] = [
    {
      type: 'function',
      function: {
        name: 'list_knowledge',
        description: 'List bundled knowledge markdown slugs with one-line previews.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'read_knowledge',
        description: 'Read full bundled markdown for a slug (filename without .md).',
        parameters: {
          type: 'object',
          properties: { slug: { type: 'string' } },
          required: ['slug'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_dev_task',
        description:
          'Run a sandboxed dev/ops task (service pings, config status). No arbitrary shell commands.',
        parameters: {
          type: 'object',
          properties: {
            task: {
              type: 'string',
              enum: [...DEV_TASK_NAMES],
              description:
                'service_status = which integrations are configured; ping_crater / ping_contact_api = connectivity check; list_knowledge_slugs = bundled docs.',
            },
          },
          required: ['task'],
          additionalProperties: false,
        },
      },
    },
  ];

  if (isContactApiConfigured()) {
    base.push({
      type: 'function',
      function: {
        name: 'resolve_contact',
        description:
          'Fuzzy-match a client/person against the master contact-api (names, typos, aliases). Use when the user mentions a client name or asks who someone is.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Full or partial name to match' },
            email: { type: 'string' },
            phone: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
    });
  }

  if (isCraterConfigured()) {
    base.push(
      {
        type: 'function',
        function: {
          name: 'create_invoice',
          description:
            'Create an invoice in Crater for a customer. Crater finds or creates the customer by name. Prices are in whole dollars. Defaults to a DRAFT invoice unless status is given.',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string', description: 'Customer/client name' },
              customer_email: { type: 'string', description: 'Optional email for a new customer' },
              items: {
                type: 'array',
                description: 'Line items. For a simple "$X for <desc>" request, use one item with quantity 1.',
                items: lineItemSchema,
              },
              notes: { type: 'string' },
              status: {
                type: 'string',
                enum: [...INVOICE_STATUS_ENUM],
                description: 'Defaults to DRAFT. Only set SENT if the user says it was sent.',
              },
            },
            required: ['customer_name', 'items'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_customers',
          description: 'Search Crater customers by name/email/phone. Use to confirm a customer exists or disambiguate before invoicing.',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Search text (optional; empty lists all)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_recent_invoices',
          description: 'List recent invoices from Crater with status, totals, and links.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_invoice',
          description: 'Fetch a single Crater invoice by ID, including line items and customer.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
            },
            required: ['invoice_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'update_invoice',
          description: 'Update invoice status, due date, or notes in Crater.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
              status: { type: 'string', enum: [...INVOICE_STATUS_ENUM] },
              due_date: { type: 'string', description: 'YYYY-MM-DD' },
              notes: { type: 'string' },
            },
            required: ['invoice_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'delete_invoice',
          description: 'Permanently delete a Crater invoice by ID. Use only when the user explicitly asks to delete/remove an invoice.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
            },
            required: ['invoice_id'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'add_invoice_items',
          description: 'Add line items to an existing Crater invoice. Prices are whole dollars.',
          parameters: {
            type: 'object',
            properties: {
              invoice_id: { type: 'string', description: 'Crater invoice ID' },
              items: { type: 'array', items: lineItemSchema, minItems: 1 },
            },
            required: ['invoice_id', 'items'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_line_items',
          description: 'Search Crater line-item templates (catalog) by name.',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Optional search text' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'record_payment',
          description:
            'Record an offline payment in Crater for a customer. May return needs_selection if customer, invoice, or payment_mode is ambiguous — re-call with specifics.',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string' },
              amount: { type: 'number', description: 'Payment amount in whole dollars' },
              payment_mode: { type: 'string', enum: [...PAYMENT_MODE_ENUM] },
              payment_date: { type: 'string', description: 'YYYY-MM-DD; defaults to today' },
              notes: { type: 'string' },
              invoice_id: { type: 'integer', description: 'Apply payment to this invoice when multiple are open' },
            },
            required: ['customer_name', 'amount'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_recurring_invoices',
          description: 'List recurring invoices with schedule and customer info.',
          parameters: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: [...RECURRING_STATUS_ENUM], description: 'Optional filter' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_recurring_invoice',
          description:
            'Create a recurring invoice for an existing Crater customer (defaults to annual hosting template).',
          parameters: {
            type: 'object',
            properties: {
              customer_name: { type: 'string' },
              starts_at: { type: 'string', description: 'YYYY-MM-DD' },
              frequency: { type: 'string', description: 'Cron expression, e.g. 0 0 1 4 *' },
              send_automatically: { type: 'boolean' },
            },
            required: ['customer_name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'repair_invoice_numbers',
          description:
            'Admin repair: fix sequence numbers and totals on invoices created by older integrations. Defaults to dry_run=true.',
          parameters: {
            type: 'object',
            properties: {
              dry_run: { type: 'boolean', description: 'Default true — set false to apply fixes' },
              only: { type: 'string', enum: ['numbers', 'totals', 'all'] },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'repair_payment_numbers',
          description: 'Admin repair: fix payment sequence numbers. Defaults to dry_run=true.',
          parameters: {
            type: 'object',
            properties: {
              dry_run: { type: 'boolean', description: 'Default true — set false to apply fixes' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'reset_invoices',
          description:
            'DESTRUCTIVE: wipe all invoices/payments for the company. Requires confirm=YES_DELETE_EVERYTHING. Use dry_run first.',
          parameters: {
            type: 'object',
            properties: {
              confirm: {
                type: 'string',
                description: 'Must be exactly YES_DELETE_EVERYTHING',
              },
              dry_run: { type: 'boolean', description: 'Default false when confirming; set true to preview counts' },
            },
            required: ['confirm'],
            additionalProperties: false,
          },
        },
      }
    );
  }

  return base;
}

/** Export full tool config as JSON (for assistant updates / docs). */
export function exportToolConfigJson(): string {
  return JSON.stringify(buildTools(), null, 2);
}

function parseLineItems(raw: unknown): Array<{ name: string; description?: string; quantity: number; price: number }> {
  const items = Array.isArray(raw) ? raw : [];
  return items
    .filter((i) => i && typeof i === 'object' && typeof (i as { price?: unknown }).price === 'number')
    .map((i) => {
      const row = i as { name?: string; description?: string; quantity?: number; price: number };
      return {
        name: (row.name ?? 'Service').trim() || 'Service',
        description: row.description,
        quantity: typeof row.quantity === 'number' && row.quantity > 0 ? row.quantity : 1,
        price: row.price,
      };
    });
}

export async function runTool(name: string, argsJson: string): Promise<string> {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;

    if (name === 'list_knowledge') {
      return JSON.stringify({ files: summarizeKnowledgeIndex() });
    }
    if (name === 'read_knowledge') {
      const slug = String(args.slug ?? '').trim();
      if (!slug) return JSON.stringify({ error: 'missing slug' });
      const doc = readKnowledgeMarkdown(slug);
      if (!doc) return JSON.stringify({ error: 'unknown slug', known: listKnowledgeSlugs() });
      const cap = 14_000;
      const content = doc.content.length > cap ? `${doc.content.slice(0, cap)}\n\n…(truncated)` : doc.content;
      return JSON.stringify({ slug: doc.slug, content });
    }
    if (name === 'run_dev_task') {
      const task = String(args.task ?? '').trim();
      if (!isDevTaskName(task)) {
        return JSON.stringify({ error: 'invalid task', allowed: DEV_TASK_NAMES });
      }
      const out = await runDevTask(task);
      if (!out.ok) return JSON.stringify({ error: out.error });
      return JSON.stringify(out);
    }
    if (name === 'resolve_contact') {
      const result = await resolveContact({
        name: args.name as string | undefined,
        email: args.email as string | undefined,
        phone: args.phone as string | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'create_invoice') {
      const items = parseLineItems(args.items);
      if (!String(args.customer_name ?? '').trim()) return JSON.stringify({ error: 'customer_name is required' });
      if (!items.length) return JSON.stringify({ error: 'at least one item with a price is required' });
      const result = await craterCreateInvoice({
        customerName: String(args.customer_name),
        customerEmail: args.customer_email as string | undefined,
        items,
        notes: args.notes as string | undefined,
        status: args.status as (typeof INVOICE_STATUS_ENUM)[number] | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'search_customers') {
      const result = await craterSearchCustomers(String(args.q ?? ''));
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ count: result.data.count, customers: result.data.customers?.slice(0, 25) ?? [] });
    }
    if (name === 'list_recent_invoices') {
      const result = await craterListInvoices();
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ count: result.data.count, invoices: result.data.invoices?.slice(0, 20) ?? [] });
    }
    if (name === 'get_invoice') {
      const result = await craterGetInvoice(String(args.invoice_id ?? ''));
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'update_invoice') {
      const result = await craterUpdateInvoice(String(args.invoice_id ?? ''), {
        status: args.status as (typeof INVOICE_STATUS_ENUM)[number] | undefined,
        due_date: args.due_date as string | undefined,
        notes: args.notes as string | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'delete_invoice') {
      const result = await craterDeleteInvoice(String(args.invoice_id ?? ''));
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'add_invoice_items') {
      const items = parseLineItems(args.items);
      if (!items.length) return JSON.stringify({ error: 'at least one item with a price is required' });
      const result = await craterAddInvoiceItems(String(args.invoice_id ?? ''), items);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'search_line_items') {
      const result = await craterSearchLineItems(args.q as string | undefined);
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({ count: result.data.count, line_items: result.data.line_items?.slice(0, 25) ?? [] });
    }
    if (name === 'record_payment') {
      const result = await craterRecordPayment({
        customerName: String(args.customer_name ?? ''),
        amount: Number(args.amount),
        paymentMode: args.payment_mode as (typeof PAYMENT_MODE_ENUM)[number] | undefined,
        paymentDate: args.payment_date as string | undefined,
        notes: args.notes as string | undefined,
        invoiceId: typeof args.invoice_id === 'number' ? args.invoice_id : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'list_recurring_invoices') {
      const result = await craterListRecurringInvoices(
        args.status as (typeof RECURRING_STATUS_ENUM)[number] | undefined
      );
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        count: result.data.count,
        recurring_invoices: result.data.recurring_invoices?.slice(0, 20) ?? [],
      });
    }
    if (name === 'create_recurring_invoice') {
      const result = await craterCreateRecurringInvoice({
        customerName: String(args.customer_name ?? ''),
        startsAt: args.starts_at as string | undefined,
        frequency: args.frequency as string | undefined,
        sendAutomatically: args.send_automatically as boolean | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'repair_invoice_numbers') {
      const result = await craterRepairInvoiceNumbers({
        dryRun: args.dry_run !== false,
        only: args.only as 'numbers' | 'totals' | 'all' | undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'repair_payment_numbers') {
      const result = await craterRepairPaymentNumbers({ dryRun: args.dry_run !== false });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }
    if (name === 'reset_invoices') {
      const result = await craterResetInvoices({
        confirm: String(args.confirm ?? ''),
        dryRun: Boolean(args.dry_run),
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify(result.data);
    }

    return JSON.stringify({ error: `unknown tool ${name}` });
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) });
  }
}
