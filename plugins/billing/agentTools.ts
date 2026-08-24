import { summarizeKnowledgeIndex } from '../../src/lib/localKnowledge';
import {
  storeListKnowledge,
  storeReadKnowledge,
  storeSearchKnowledge,
  storeWriteKnowledge,
  isKnowledgeDbConfigured,
} from '../../src/lib/knowledgeStore';
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
} from '../../src/lib/workStore';
import {
  completedItemsToInvoiceSuggestions,
  groupedInvoiceDescription,
  parseMarkdownCheckboxes,
} from '../../src/lib/workChecklist';
import { findCheckboxByText } from '../../src/lib/markdownCheckboxes';
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
} from '../../src/lib/todoStore';
import { getContactDeleteBlockers, executeContactDelete } from '../../src/lib/contactDeleteGuard';
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
} from '../../src/lib/contactApi';
import {
  extractClientSearchTerms,
  formatClientCandidate,
  primaryClientSearchTerm,
  resolveContactEnhanced,
  resolveWorkClientDecision,
  searchClientsEnhanced,
} from '../../src/lib/clientSearch';
import {
  isCraterConfigured,
  craterCreateInvoice,
  craterSearchCustomers,
  craterListInvoices,
  craterGetInvoice,
  craterUpdateInvoice,
  craterDeleteInvoice,
  craterAddInvoiceItems,
  craterUpdateInvoiceItem,
  craterSearchLineItems,
  craterRecordPayment,
  craterUpdatePayment,
  craterDeletePayment,
  craterListRecurringInvoices,
  craterCreateRecurringInvoice,
  craterRepairInvoiceNumbers,
  craterRepairPaymentNumbers,
  craterResetInvoices,
} from '../../src/lib/craterClient';
import {
  isEmailSendConfigured,
  isSmsSendConfigured,
  sendEmail,
  sendSms,
} from '../../src/lib/outbound';
import { DEV_TASK_NAMES, isDevTaskName, runDevTask } from '../../src/lib/devTaskRunner';
import {
  formatRailwayNetworkingSummary,
  isRailwayConfigured,
  railwayListProjectNetworking,
} from '../../src/lib/railwayClient';
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
} from '../../src/lib/kinstaClient';
import { getGitStatus, getRecentCommits, listOpenBranches, checkDeploymentStatus } from '../../src/lib/devStatus';
import { githubCreateBranch, githubCreatePullRequest, githubDefaultBranch, githubRepoSlug, githubWriteFile } from '../../src/lib/githubClient';
import { describeSafeShell, runSafeShellCommand } from '../../src/lib/safeShell';
import {
  codeDevExecCommand,
  codeDevListFiles,
  codeDevReadFile,
  codeDevWriteFile,
} from '../../src/lib/codeDevTools';
import { deliverShare } from '../../src/lib/shareDelivery';
import { braveSearch, formatBraveResults, isBraveConfigured } from '../../src/lib/braveClient';
import { fetchUrl } from '../../src/lib/fetchUrlClient';
import {
  storeDeleteEmailInbox,
  storeListEmailInbox,
  storeUpdateEmailInbox,
  storeGetEmailInbox,
  type EmailInboxPatch,
} from '../../src/lib/emailInboxStore';
import { extractMonetaryAmountFromEmail, formatUsdAmount } from '../../src/lib/emailMoney';
import { buildReplyEmailHeaders } from '../../src/lib/emailReply';
import { brandedPlainTextEmail } from '../../src/lib/inboundEmailReply';
import { assignEmailToJob, linkProjectItem, linkWorkFromAgentContext } from '../../src/lib/projectLinks';
import { markInboxEmailAsProject } from '../../src/lib/emailProjectCategory';
import { importEmailAttachmentsToProject } from '../../src/lib/emailProjectAttachments';
import {
  storeAddChatImagesToProject,
  storeListProjectFiles,
} from '../../src/lib/projectFiles';
import { logOutboundEmailForProject } from '../../src/lib/logOutboundEmailForProject';
import { recordProjectOutboundEmail } from '../../src/lib/projectOutboundEmail';
import { getAgentContext } from '../../src/lib/agentContext';
import { defaultBrandContext, getCompanyBrandContext, type CompanyBrandContext } from '../../src/lib/companyConfig';
import { syncVapiAssistantBrand } from '../../src/lib/vapiAssistantSync';
import { isVapiAdminConfigured } from '../../src/lib/vapiPlugin';
import { storeCreateEmailRule, storeListEmailRules } from '../../src/lib/emailRuleStore';
import type { RuleField } from '../../src/lib/emailRules';
import { MAX_AGENT_EMAIL_BODY } from '../../src/lib/emailAgentContext';
import { formatLighthouseResults, lighthouseAudit } from '../../src/lib/lighthouseClient';
import { sslCheck, formatSslCheckResults } from '../../src/lib/sslCheckClient';
import { checkLinks, formatCheckLinksResults } from '../../src/lib/checkLinksClient';
import { dnsCheck, formatDnsCheckResults } from '../../src/lib/dnsCheckClient';
import { syncAllResendDnsToCloudflare, syncResendDnsToCloudflare } from '../../src/lib/resendDnsSync';
import { hasFeature } from '../../src/lib/features';
import { syncUptimeMonitorsFromApi } from '../../src/lib/uptimeMonitoring';
import { isUptimeRobotConfigured } from '../../src/lib/uptimerobotClient';
import { isUptimeDbConfigured } from '../../src/lib/pgUptime';
import {
  isChangeDetectionConfigured,
  cdGetWatch,
  cdRecheckWatch,
} from '../../src/lib/changedetectionClient';
import {
  portalSiteUrl,
  SITE_URL_FIELD_LABEL,
} from '../../src/lib/siteMonitoring';
import {
  isBookingConfigured,
  bookingList,
  bookingGet,
  bookingEventTypes,
  publicBookingPageUrl,
  formatBookingLine,
  calcomWebappUrl,
} from '../../src/lib/bookingClient';

import type { AgentToolDef, AgentToolModule, ToolContext } from '../../src/lib/agentTools/types';
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
} from '../../src/lib/agentTools/shared';

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

async function handle_update_invoice_item(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const invoiceId = String(args.invoice_id ?? '').trim();
  const itemId = String(args.item_id ?? '').trim();
  if (!invoiceId) return JSON.stringify({ error: 'invoice_id is required' });
  if (!itemId) return JSON.stringify({ error: 'item_id is required' });
  const result = await craterUpdateInvoiceItem(invoiceId, itemId, {
    name: args.name as string | undefined,
    description: args.description as string | undefined,
    quantity: args.quantity !== undefined ? Number(args.quantity) : undefined,
    price: args.price !== undefined ? Number(args.price) : undefined,
  });
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

async function handle_update_payment(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const paymentId = Number(args.payment_id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return JSON.stringify({ error: 'payment_id must be a positive integer' });
  }
  const result = await craterUpdatePayment({
    paymentId,
    paymentMethod: args.payment_method as string | undefined,
    paymentDate: args.payment_date as string | undefined,
    notes: args.notes as string | undefined,
    amount: args.amount !== undefined ? Number(args.amount) : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify(result.data);
}

async function handle_delete_payment(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const paymentId = Number(args.payment_id);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return JSON.stringify({ error: 'payment_id must be a positive integer' });
  }
  const result = await craterDeletePayment(paymentId);
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
