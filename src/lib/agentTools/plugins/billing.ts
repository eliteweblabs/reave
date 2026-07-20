import { summarizeKnowledgeIndex } from '../../localKnowledge';
import {
  storeListKnowledge,
  storeReadKnowledge,
  storeSearchKnowledge,
  storeWriteKnowledge,
  isKnowledgeDbConfigured,
} from '../../knowledgeStore';
import {
  isSafeWorkSlug,
  slugFromTitle,
  storeDeleteWork,
  storeListWork,
  storeReadWork,
  storeWriteWork,
  storeToggleWorkCheckbox,
  patchWorkSourceChatId,
  WORK_PRIORITIES,
  WORK_STATUSES,
  type WorkPriority,
  type WorkStatus,
} from '../../workStore';
import {
  completedItemsToInvoiceSuggestions,
  groupedInvoiceDescription,
  parseMarkdownCheckboxes,
} from '../../workChecklist';
import { findCheckboxByText } from '../../markdownCheckboxes';
import {
  isTodoDbConfigured,
  normalizeTodoPriority,
  normalizeTodoStatus,
  storeCreateTodo,
  storeDeleteTodo,
  storeListTodos,
  storeMarkTodoDone,
  storeUpdateTodo,
  TODO_PRIORITIES,
  TODO_STATUSES,
  type TodoPriority,
  type TodoStatus,
} from '../../todoStore';
import { getContactDeleteBlockers, executeContactDelete } from '../../contactDeleteGuard';
import {
  isContactApiConfigured,
  resolveContact,
  listContacts,
  createContact,
  updateContact,
  getContact,
  setContactPortal,
  extractPortal,
  clientPortalUrl,
  type ClientPortal,
  type ClientPortalField,
  type ClientDataEntry,
} from '../../contactApi';
import {
  extractClientSearchTerms,
  formatClientCandidate,
  primaryClientSearchTerm,
  resolveContactEnhanced,
  resolveWorkClientDecision,
  searchClientsEnhanced,
} from '../../clientSearch';
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
} from '../../craterClient';
import {
  isEmailSendConfigured,
  isSmsSendConfigured,
  sendEmail,
  sendSms,
} from '../../outbound';
import { DEV_TASK_NAMES, isDevTaskName, runDevTask } from '../../devTaskRunner';
import {
  formatRailwayNetworkingSummary,
  isRailwayConfigured,
  railwayListProjectNetworking,
} from '../../railwayClient';
import {
  formatKinstaSitesSummary,
  isKinstaConfigured,
  kinstaClearCache,
  kinstaCreateManualBackup,
  kinstaCreateSite,
  kinstaDeleteSite,
  kinstaGetOperation,
  kinstaGetSite,
  kinstaListBackups,
  kinstaListSites,
} from '../../kinstaClient';
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from '../../devStatus';
import { githubCreateBranch, githubCreatePullRequest, githubDefaultBranch, githubRepoSlug, githubWriteFile } from '../../githubClient';
import { describeSafeShell, runSafeShellCommand } from '../../safeShell';
import {
  codeDevExecCommand,
  codeDevListFiles,
  codeDevReadFile,
  codeDevWriteFile,
} from '../../codeDevTools';
import { deliverShare } from '../../shareDelivery';
import { braveSearch, formatBraveResults, isBraveConfigured } from '../../braveClient';
import { fetchUrl } from '../../fetchUrlClient';
import {
  storeDeleteEmailInbox,
  storeListEmailInbox,
  storeUpdateEmailInbox,
  storeGetEmailInbox,
  type EmailInboxPatch,
} from '../../emailInboxStore';
import { extractMonetaryAmountFromEmail, formatUsdAmount } from '../../emailMoney';
import { buildReplyEmailHeaders } from '../../emailReply';
import { brandedPlainTextEmail } from '../../inboundEmailReply';
import { assignEmailToJob, linkProjectItem, linkWorkFromAgentContext } from '../../projectLinks';
import { markInboxEmailAsProject } from '../../emailProjectCategory';
import { importEmailAttachmentsToProject } from '../../emailProjectAttachments';
import {
  storeAddChatImagesToProject,
  storeListProjectFiles,
} from '../../projectFiles';
import { logOutboundEmailForProject } from '../../logOutboundEmailForProject';
import { recordProjectOutboundEmail } from '../../projectOutboundEmail';
import { getAgentContext } from '../../agentContext';
import { defaultBrandContext, getCompanyBrandContext, type CompanyBrandContext } from '../../companyConfig';
import { syncVapiAssistantBrand } from '../../vapiAssistantSync';
import { isVapiAdminConfigured } from '../../vapiPlugin';
import { storeCreateEmailRule, storeListEmailRules } from '../../emailRuleStore';
import type { RuleField } from '../../emailRules';
import { MAX_AGENT_EMAIL_BODY } from '../../emailAgentContext';
import { formatLighthouseResults, lighthouseAudit } from '../../lighthouseClient';
import { sslCheck, formatSslCheckResults } from '../../sslCheckClient';
import { checkLinks, formatCheckLinksResults } from '../../checkLinksClient';
import { dnsCheck, formatDnsCheckResults } from '../../dnsCheckClient';
import { syncAllResendDnsToCloudflare, syncResendDnsToCloudflare } from '../../resendDnsSync';
import { hasFeature } from '../../features';
import { syncUptimeMonitorsFromApi } from '../../uptimeMonitoring';
import { isUptimeRobotConfigured } from '../../uptimerobotClient';
import { isUptimeDbConfigured } from '../../pgUptime';
import {
  isChangeDetectionConfigured,
  cdGetWatch,
  cdRecheckWatch,
} from '../../changedetectionClient';
import {
  portalSiteUrl,
  SITE_URL_FIELD_LABEL,
} from '../../siteMonitoring';
import {
  isBookingConfigured,
  bookingList,
  bookingGet,
  bookingEventTypes,
  publicBookingPageUrl,
  formatBookingLine,
  calcomWebappUrl,
} from '../../bookingClient';

import type { AgentToolDef, AgentToolModule, ToolContext } from '../types';
import {
  INVOICE_STATUS_ENUM,
  PAYMENT_MODE_ENUM,
  RECURRING_STATUS_ENUM,
  lineItemSchema,
  parseEmailListArg,
  parseLineItems,
  parsePortalFields,
  parsePortalData,
  plainTextFromHtml,
  resolvePortalTarget,
  workExtrasFromArgs,
} from '../shared';

async function handle_create_invoice(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
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

async function handle_search_customers(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterSearchCustomers(String(args.q ?? ''));
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ count: result.data.count, customers: result.data.customers?.slice(0, 25) ?? [] });
}

async function handle_list_recent_invoices(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterListInvoices();
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ count: result.data.count, invoices: result.data.invoices?.slice(0, 20) ?? [] });
}

async function handle_get_invoice(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterGetInvoice(String(args.invoice_id ?? ''));
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_update_invoice(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterUpdateInvoice(String(args.invoice_id ?? ''), {
    status: args.status as (typeof INVOICE_STATUS_ENUM)[number] | undefined,
    due_date: args.due_date as string | undefined,
    notes: args.notes as string | undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_delete_invoice(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterDeleteInvoice(String(args.invoice_id ?? ''));
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_add_invoice_items(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const items = parseLineItems(args.items);
  if (!items.length) return JSON.stringify({ error: 'at least one item with a price is required' });
  const result = await craterAddInvoiceItems(String(args.invoice_id ?? ''), items);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_search_line_items(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterSearchLineItems(args.q as string | undefined);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({ count: result.data.count, line_items: result.data.line_items?.slice(0, 25) ?? [] });
}

async function handle_record_payment(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
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

async function handle_list_recurring_invoices(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterListRecurringInvoices(
    args.status as (typeof RECURRING_STATUS_ENUM)[number] | undefined
  );
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({
    count: result.data.count,
    recurring_invoices: result.data.recurring_invoices?.slice(0, 20) ?? [],
  });
}

async function handle_create_recurring_invoice(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterCreateRecurringInvoice({
    customerName: String(args.customer_name ?? ''),
    startsAt: args.starts_at as string | undefined,
    frequency: args.frequency as string | undefined,
    sendAutomatically: args.send_automatically as boolean | undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_repair_invoice_numbers(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterRepairInvoiceNumbers({
    dryRun: args.dry_run !== false,
    only: args.only as 'numbers' | 'totals' | 'all' | undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_repair_payment_numbers(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterRepairPaymentNumbers({ dryRun: args.dry_run !== false });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_reset_invoices(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await craterResetInvoices({
    confirm: String(args.confirm ?? ''),
    dryRun: Boolean(args.dry_run),
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

export const billingModule: AgentToolModule = {
  id: 'billing',
  enabled: (ctx) => hasFeature('billing') && isCraterConfigured(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
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
    ];
  },
  handlers: {
    'create_invoice': handle_create_invoice,
    'search_customers': handle_search_customers,
    'list_recent_invoices': handle_list_recent_invoices,
    'get_invoice': handle_get_invoice,
    'update_invoice': handle_update_invoice,
    'delete_invoice': handle_delete_invoice,
    'add_invoice_items': handle_add_invoice_items,
    'search_line_items': handle_search_line_items,
    'record_payment': handle_record_payment,
    'list_recurring_invoices': handle_list_recurring_invoices,
    'create_recurring_invoice': handle_create_recurring_invoice,
    'repair_invoice_numbers': handle_repair_invoice_numbers,
    'repair_payment_numbers': handle_repair_payment_numbers,
    'reset_invoices': handle_reset_invoices,
  },
};
