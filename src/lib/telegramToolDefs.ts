/**
 * Telegram assistant tool definitions (JSON schema) and dispatch.
 * Single source of truth for buildTools / runTool.
 */
import { listKnowledgeSlugs, readKnowledgeMarkdown, summarizeKnowledgeIndex } from './localKnowledge';
import {
  isContactApiConfigured,
  resolveContact,
  listContacts,
  createContact,
  getContact,
  setContactPortal,
  extractPortal,
  clientPortalUrl,
  type ClientPortal,
  type ClientPortalField,
  type ClientDataEntry,
} from './contactApi';
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
import {
  isEmailSendConfigured,
  isSmsSendConfigured,
  sendEmail,
  sendSms,
} from './outbound';
import { DEV_TASK_NAMES, isDevTaskName, runDevTask } from './devTaskRunner';
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from './devStatus';
import { describeSafeShell, runSafeShellCommand } from './safeShell';

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
    {
      type: 'function',
      function: {
        name: 'get_git_status',
        description:
          'Snapshot of the GitHub repo (source of truth): current/default branch, latest commits, branch count, and whether the live deploy is on the latest commit. Use to verify work was committed & pushed. Local uncommitted/unstaged changes are NOT visible here — use run_terminal_command on a checked-out repo for that.',
        parameters: {
          type: 'object',
          properties: {
            branch: { type: 'string', description: 'Branch to inspect; defaults to the repo default branch.' },
            limit: { type: 'integer', description: 'How many recent commits to include (1-30, default 8).' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_recent_commits',
        description:
          'Recent commit history from GitHub (author, message, timestamp, link; optionally files changed). Use to verify whether specific work landed.',
        parameters: {
          type: 'object',
          properties: {
            branch: { type: 'string', description: 'Branch to read; defaults to the repo default branch.' },
            limit: { type: 'integer', description: 'Number of commits (1-30, default 5).' },
            with_files: { type: 'boolean', description: 'Include changed files + stats per commit (slower).' },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'check_deployment_status',
        description:
          'Is the latest pushed code actually live? Compares the deployed commit (Railway RAILWAY_GIT_COMMIT_SHA) to GitHub’s latest commit on the default branch and pings the public health endpoint. Returns a one-line summary plus details.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_open_branches',
        description:
          'List active branches on GitHub with how far each is ahead/behind the default branch. Use to track in-progress work.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    {
      type: 'function',
      function: {
        name: 'run_terminal_command',
        description:
          `Run a single READ-ONLY shell command in a sandbox (no shell, no pipes/redirects/chaining). Allowed binaries: ${describeSafeShell().binaries.join(', ')}; git is limited to read-only subcommands (${describeSafeShell().git_subcommands.join(', ')}). Useful where the repo is checked out; on the live container there may be no git checkout.`,
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'e.g. "git log --oneline -10", "git status", "git branch -a", "ls".' },
          },
          required: ['command'],
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

    base.push(
      {
        type: 'function',
        function: {
          name: 'list_contacts',
          description:
            'List or search ALL contacts in the master contact-api (the full client list). Each result includes a portal_url — every client automatically has a shareable page. Use when the user asks to see/browse their contacts or clients, wants a client’s link, or wants to pick one. Optional `q` filters by name/email; omit it to list everyone (newest first).',
          parameters: {
            type: 'object',
            properties: {
              q: { type: 'string', description: 'Optional search text (name or email); omit to list all' },
              limit: { type: 'integer', description: 'Max results (1-200, default 50)' },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'create_contact',
          description:
            'Add a new contact/client to the master contact-api. Use when the user wants to add a client or create a test client. Returns the new contact uid and its portal_url.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Full name (required)' },
              email: { type: 'string' },
              phone: { type: 'string' },
              company: { type: 'string' },
              notes: { type: 'string', description: 'Private internal notes (never shown on the client portal)' },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'set_client_portal',
          description:
            'Customize a client’s shareable portal page (every client already HAS a page; this sets optional content). Overview = headline/body/fields. Billing = automatic from Crater. Data tab = web-design handoff items (passwords, DNS, hosting) via the `data` param. The link is mobile-friendly and great for iOS "Add to Home Screen". Identify the client by uid or by name (fuzzy-resolved; if ambiguous it returns candidates to confirm). Text updates merge; fields/data replace the prior list when provided. Set enabled:false to hide/revoke the page. Returns the shareable URL. Client-facing — does NOT expose the internal private notes field.',
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'Contact uid (preferred if known)' },
              name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
              email: { type: 'string', description: 'Optional, improves name resolution' },
              phone: { type: 'string', description: 'Optional, improves name resolution' },
              headline: { type: 'string', description: 'Short title shown at the top of the portal' },
              body: {
                type: 'string',
                description: 'Main client-facing text (project status, links, instructions). Newlines and URLs are preserved.',
              },
              fields: {
                type: 'array',
                description: 'Optional labeled key/value rows shown in Overview (e.g. "Site URL" → "https://…", "Plan" → "Annual").',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    value: { type: 'string' },
                  },
                  required: ['label', 'value'],
                  additionalProperties: false,
                },
              },
              data: {
                type: 'array',
                description:
                  'Web-design handoff items shown in the client’s DATA tab (passwords, DNS records, hosting/login info, etc.). Each entry has a label plus any of: value, username, password, url. Passwords are masked on the page (reveal/copy). Replaces the existing data list when provided.',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string', description: 'e.g. "WordPress admin", "DNS — A record", "Hosting"' },
                    value: { type: 'string', description: 'Free-form value/notes (e.g. a DNS record or instructions)' },
                    username: { type: 'string' },
                    password: { type: 'string' },
                    url: { type: 'string' },
                  },
                  required: ['label'],
                  additionalProperties: false,
                },
              },
              enabled: {
                type: 'boolean',
                description: 'Set false to revoke/hide the portal (link returns 404). Defaults to true.',
              },
            },
            additionalProperties: false,
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_client_portal',
          description:
            'Get a client’s shareable portal link and its current custom content. Every client has a page by default, so the link is always valid unless the page was explicitly hidden (enabled:false). Identify by uid or name (fuzzy-resolved). Use to retrieve the link to send to a client or to review what they currently see.',
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'Contact uid (preferred if known)' },
              name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
              email: { type: 'string' },
              phone: { type: 'string' },
            },
            additionalProperties: false,
          },
        },
      }
    );

    if (isEmailSendConfigured() || isSmsSendConfigured()) {
      base.push({
        type: 'function',
        function: {
          name: 'send_client_portal',
          description:
            'Send a client their portal link directly to them via email (Resend) and/or SMS (Twilio). This is the "send the client link to <name>" command. Identify by uid or name (fuzzy-resolved). channel "auto" (default) emails them if an email is on file, otherwise texts them. Use the message field to add a short personal note. The page shows their details and any outstanding Crater invoices.',
          parameters: {
            type: 'object',
            properties: {
              uid: { type: 'string', description: 'Contact uid (preferred if known)' },
              name: { type: 'string', description: 'Client name to resolve when uid is unknown' },
              email: { type: 'string', description: 'Optional, improves name resolution' },
              phone: { type: 'string', description: 'Optional, improves name resolution' },
              channel: {
                type: 'string',
                enum: ['auto', 'email', 'sms'],
                description: 'auto = email if available else SMS. Defaults to auto.',
              },
              message: { type: 'string', description: 'Optional short personal note prepended to the message.' },
            },
            additionalProperties: false,
          },
        },
      });
    }
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

function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parsePortalFields(raw: unknown): ClientPortalField[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const fields = raw
    .filter((f) => f && typeof f === 'object')
    .map((f) => {
      const row = f as { label?: unknown; value?: unknown };
      return { label: String(row.label ?? '').trim(), value: String(row.value ?? '').trim() };
    })
    .filter((f) => f.label && f.value);
  return fields;
}

function parsePortalData(raw: unknown): ClientDataEntry[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return raw
    .filter((e) => e && typeof e === 'object')
    .map((e) => {
      const row = e as Record<string, unknown>;
      const entry: ClientDataEntry = { label: str(row.label) };
      const value = str(row.value);
      const username = str(row.username);
      const password = str(row.password);
      const url = str(row.url);
      if (value) entry.value = value;
      if (username) entry.username = username;
      if (password) entry.password = password;
      if (url) entry.url = url;
      return entry;
    })
    .filter((e) => e.label && (e.value || e.username || e.password || e.url));
}

/**
 * Resolve a portal tool's target to a single contact uid. Accepts an explicit
 * uid, or fuzzy-resolves a name/email/phone. Returns a needs_selection payload
 * (as a JSON string) when the match is ambiguous so the caller can confirm.
 */
async function resolvePortalTarget(args: {
  uid?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
}): Promise<{ ok: true; uid: string } | { ok: false; payload: string }> {
  const uid = typeof args.uid === 'string' ? args.uid.trim() : '';
  if (uid) return { ok: true, uid };

  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const email = typeof args.email === 'string' ? args.email.trim() : '';
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
  if (!name && !email && !phone) {
    return { ok: false, payload: JSON.stringify({ error: 'Provide a uid, or a name/email/phone to resolve.' }) };
  }

  const resolved = await resolveContact({ name, email, phone });
  if (!resolved.ok) {
    return { ok: false, payload: JSON.stringify({ error: resolved.error, status: resolved.status }) };
  }
  const data = resolved.data as {
    match?: string;
    contact?: { uid?: string; name?: string };
    candidates?: Array<{ uid?: string; name?: string; score?: number }>;
  };
  if ((data.match === 'exact' || data.match === 'likely') && data.contact?.uid) {
    return { ok: true, uid: data.contact.uid };
  }
  return {
    ok: false,
    payload: JSON.stringify({
      needs_selection: true,
      reason: data.match === 'none' ? 'no_match' : 'ambiguous',
      match: data.match ?? 'none',
      candidates: (data.candidates ?? []).map((c) => ({ uid: c.uid, name: c.name, score: c.score })),
      hint: 'Re-call with an exact uid from candidates (or confirm the name).',
    }),
  };
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
    if (name === 'get_git_status') {
      const result = await getGitStatus({
        branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'get_recent_commits') {
      const result = await getRecentCommits({
        branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        with_files: args.with_files === true,
      });
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'check_deployment_status') {
      const result = await checkDeploymentStatus();
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'list_open_branches') {
      const result = await listOpenBranches();
      if (!result.ok) return JSON.stringify({ error: result.error });
      return JSON.stringify(result.data);
    }
    if (name === 'run_terminal_command') {
      const command = String(args.command ?? '').trim();
      if (!command) return JSON.stringify({ error: 'command is required' });
      const result = await runSafeShellCommand(command);
      if (!result.ok) return JSON.stringify({ error: result.error, allowed: describeSafeShell() });
      return JSON.stringify(result);
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
    if (name === 'list_contacts') {
      const result = await listContacts({
        q: typeof args.q === 'string' ? args.q : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        total: result.data.total,
        contacts: result.data.contacts.slice(0, 50).map((c) => ({
          uid: c.uid,
          name: c.name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          company: c.company ?? null,
          portal_url: clientPortalUrl(c.uid),
        })),
      });
    }
    if (name === 'create_contact') {
      const contactName = String(args.name ?? '').trim();
      if (!contactName) return JSON.stringify({ error: 'name is required' });
      const result = await createContact({
        name: contactName,
        email: typeof args.email === 'string' ? args.email : undefined,
        phone: typeof args.phone === 'string' ? args.phone : undefined,
        company: typeof args.company === 'string' ? args.company : undefined,
        notes: typeof args.notes === 'string' ? args.notes : undefined,
      });
      if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
      return JSON.stringify({
        success: true,
        uid: result.data.uid,
        name: result.data.name,
        email: result.data.email ?? null,
        phone: result.data.phone ?? null,
        portal_url: clientPortalUrl(result.data.uid),
      });
    }
    if (name === 'set_client_portal') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const existing = extractPortal(current.data) ?? {};

      const fields = parsePortalFields(args.fields);
      const data = parsePortalData(args.data);
      const next: ClientPortal = {
        ...existing,
        enabled: typeof args.enabled === 'boolean' ? args.enabled : existing.enabled ?? true,
        headline: typeof args.headline === 'string' ? args.headline.trim() : existing.headline,
        body: typeof args.body === 'string' ? args.body : existing.body,
        fields: fields !== undefined ? fields : existing.fields,
        data: data !== undefined ? data : existing.data,
      };

      const saved = await setContactPortal(target.uid, next);
      if (!saved.ok) return JSON.stringify({ error: saved.error, status: saved.status });
      return JSON.stringify({
        success: true,
        uid: target.uid,
        name: current.data.name,
        url: clientPortalUrl(target.uid),
        enabled: next.enabled,
        portal: next,
      });
    }
    if (name === 'get_client_portal') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const portal = extractPortal(current.data);
      return JSON.stringify({
        uid: target.uid,
        name: current.data.name,
        url: clientPortalUrl(target.uid),
        live: portal?.enabled !== false,
        has_custom_content: Boolean(portal),
        portal: portal ?? null,
      });
    }
    if (name === 'send_client_portal') {
      const target = await resolvePortalTarget(args);
      if (!target.ok) return target.payload;

      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      const c = current.data;

      const portal = extractPortal(c);
      if (portal && portal.enabled === false) {
        return JSON.stringify({ error: 'This client’s page is hidden (enabled:false). Re-enable it before sending.' });
      }

      const url = clientPortalUrl(target.uid);
      const firstName = (c.firstName || c.name || '').trim().split(/\s+/)[0] || 'there';
      const intro = typeof args.message === 'string' && args.message.trim() ? `${args.message.trim()}\n\n` : '';

      const channel = String(args.channel ?? 'auto');
      let useEmail = false;
      let useSms = false;
      if (channel === 'email') useEmail = true;
      else if (channel === 'sms') useSms = true;
      else if (c.email) useEmail = true;
      else if (c.phone) useSms = true;

      if (useEmail && !c.email) {
        return JSON.stringify({ error: 'No email on file for this client. Try channel "sms" or add an email.' });
      }
      if (useSms && !c.phone) {
        return JSON.stringify({ error: 'No phone on file for this client. Try channel "email" or add a phone.' });
      }
      if (!useEmail && !useSms) {
        return JSON.stringify({ error: 'This client has no email or phone on file to send to.' });
      }

      const sent: Record<string, unknown> = {};
      if (useEmail) {
        const subject = c.company ? `Your client page — ${c.company}` : 'Your client page';
        const text =
          `${intro}Hi ${firstName},\n\n` +
          `Here's your personal client page — your details and any outstanding invoices live here:\n\n${url}\n\n` +
          `Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.`;
        const html =
          `<p>${intro ? `${escapeForHtml(intro.trim())}<br/><br/>` : ''}Hi ${escapeForHtml(firstName)},</p>` +
          `<p>Here's your personal client page — your details and any outstanding invoices live here:</p>` +
          `<p><a href="${url}">${url}</a></p>` +
          `<p style="color:#666;font-size:13px">Tip: open it on your iPhone and tap Share → Add to Home Screen for one-tap access.</p>`;
        const r = await sendEmail({ to: c.email as string, subject, text, html });
        sent.email = r.ok ? { ok: true, to: c.email, id: r.id } : { ok: false, error: r.error };
      }
      if (useSms) {
        const body = `${intro}Hi ${firstName}, here's your client page: ${url}`;
        const r = await sendSms({ to: c.phone as string, body });
        sent.sms = r.ok ? { ok: true, to: c.phone, id: r.id } : { ok: false, error: r.error };
      }

      const anyOk = Object.values(sent).some((v) => (v as { ok?: boolean }).ok);
      return JSON.stringify({ success: anyOk, uid: target.uid, name: c.name, url, sent });
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
