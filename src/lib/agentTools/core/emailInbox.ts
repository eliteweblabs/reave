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
  parseEmailListArg,
  parseLineItems,
  parsePortalFields,
  parsePortalData,
  plainTextFromHtml,
  resolvePortalTarget,
  workExtrasFromArgs,
} from '../shared';

async function handle_read_email_inbox(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const ctx = getAgentContext();
  const emailId = String(args.email_id ?? ctx.emailId ?? '').trim();
  if (!emailId) {
    return JSON.stringify({ error: 'email_id is required (or open this chat from an inbox message)' });
  }
  const event = await storeGetEmailInbox(emailId);
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  const rawBody = event.bodyText?.trim() || event.bodySnippet?.trim() || '';
  const bodyText =
    rawBody.length > MAX_AGENT_EMAIL_BODY
      ? `${rawBody.slice(0, MAX_AGENT_EMAIL_BODY)}\n…[truncated]`
      : rawBody;
  const headersJson = event.headers ? JSON.stringify(event.headers) : '';
  const headers =
    headersJson && headersJson.length > 4_000 ? undefined : event.headers;
  return JSON.stringify({
    id: event.id,
    from: event.from,
    to: event.to,
    cc: event.cc,
    bcc: event.bcc,
    replyTo: event.replyTo,
    messageId: event.messageId,
    subject: event.subject,
    category: event.category,
    summary: event.summary,
    bodyText,
    bodySnippet: event.bodySnippet,
    ...(headers ? { headers } : {}),
    ...(headersJson.length > 4_000 ? { headers_note: 'Raw headers omitted (too large)' } : {}),
    routeNote: event.routeNote,
    receivedAt: event.receivedAt,
    jobSlug: event.jobSlug,
    jobTitle: event.jobTitle,
  });
}

async function handle_list_email_inbox(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const q = String(args.q ?? '').trim().toLowerCase();
  const includeJunk = args.include_junk === true;
  const limitRaw = Number(args.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;
  let events = await storeListEmailInbox(Math.max(limit, 100), { hideJunk: !includeJunk });
  if (q) {
    events = events.filter((e) => {
      const hay = `${e.from} ${e.subject} ${e.summary} ${e.bodySnippet} ${e.bodyText}`.toLowerCase();
      return hay.includes(q);
    });
  }
  events = events.slice(0, limit);
  return JSON.stringify({
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      category: e.category,
      summary: e.summary,
      receivedAt: e.receivedAt,
    })),
  });
}

async function handle_mark_email_junk(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const event = await storeUpdateEmailInbox(emailId, {
    category: 'junk',
    action: 'junk',
    status: 'JUNK',
  });
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({ ok: true, email_id: emailId, category: event.category, action: event.action });
}

async function handle_mark_email_receipt(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const existing = await storeGetEmailInbox(emailId);
  if (!existing) return JSON.stringify({ error: 'not found', email_id: emailId });
  const amount = extractMonetaryAmountFromEmail(existing);
  const routeNote =
    amount != null ? `Tax receipt — ${formatUsdAmount(amount)}` : 'Tax receipt';
  const event = await storeUpdateEmailInbox(emailId, {
    category: 'receipt',
    action: 'receipt',
    status: 'RECEIPT',
    routeNote,
  });
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({
    ok: true,
    email_id: emailId,
    category: event.category,
    action: event.action,
    routeNote: event.routeNote,
    monetary_amount: amount,
  });
}

async function handle_mark_email_routed(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const existing = await storeGetEmailInbox(emailId);
  if (!existing) return JSON.stringify({ error: 'not found', email_id: emailId });
  const patch: EmailInboxPatch = {
    action: 'filed',
    status: 'FILED',
  };
  if (existing.category === 'review') patch.category = 'internal';
  const event = await storeUpdateEmailInbox(emailId, patch);
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({
    ok: true,
    email_id: emailId,
    category: event.category,
    action: event.action,
    routed: true,
  });
}

async function handle_delete_email(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const deleted = await storeDeleteEmailInbox(emailId);
  if (!deleted) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({ ok: true, email_id: emailId, deleted: true });
}

async function handle_create_email_filter_rule(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const sender = String(args.sender ?? '').trim().toLowerCase();
  const extra = Array.isArray(args.phrases)
    ? (args.phrases as unknown[]).map((p) => String(p).trim()).filter(Boolean)
    : [];
  const phrases = [...new Set([...(sender ? [sender] : []), ...extra])];
  if (!phrases.length) return JSON.stringify({ error: 'sender or phrases required' });

  const config = await storeListEmailRules();
  const needle = phrases[0].toLowerCase();
  const existing = config.rules.find(
    (r) =>
      r.enabled &&
      r.fields.includes('from' as RuleField) &&
      r.phrases.some((p) => p.toLowerCase() === needle),
  );
  if (existing) {
    return JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'rule already exists',
      rule: { id: existing.id, title: existing.title, phrases: existing.phrases },
    });
  }

  const title =
    String(args.title ?? '').trim() ||
    (sender ? `Block sender ${sender}` : `Block: ${phrases[0].slice(0, 40)}`);
  const rule = await storeCreateEmailRule({
    title,
    status: 'DELETE',
    description: 'Auto-junk — created by agent from inbox triage',
    phrases,
    matchMode: 'any',
    fields: sender ? (['from'] as RuleField[]) : (['subject', 'body'] as RuleField[]),
    notify: false,
    enabled: true,
  });
  if (!rule) return JSON.stringify({ error: 'failed to create rule' });
  return JSON.stringify({
    ok: true,
    rule: { id: rule.id, title: rule.title, status: rule.status, phrases: rule.phrases, fields: rule.fields },
  });
}

export const emailInboxModule: AgentToolModule = {
  id: 'emailInbox',
  enabled: (ctx) => true,
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
          {
            type: 'function',
            function: {
              name: 'read_email_inbox',
              description:
                'Read one inbound inbox message with full headers and body. Use when you need domain names or other specifics. Defaults to the email linked to this chat when email_id is omitted.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: {
                    type: 'string',
                    description: 'Inbox message UUID — omit to use the email linked to this chat',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_email_inbox',
              description:
                `List recent inbound emails from the ${brand.name} inbox log (admin Email tab). Use when triaging mail or finding a message id by sender/subject.`,
              parameters: {
                type: 'object',
                properties: {
                  q: { type: 'string', description: 'Optional search on from, subject, or summary' },
                  include_junk: {
                    type: 'boolean',
                    description: 'Include junk-marked messages (default false)',
                  },
                  limit: { type: 'number', description: 'Max rows (default 20, max 100)' },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'mark_email_junk',
              description:
                'Mark an inbound inbox message as junk (hidden from default inbox). Requires the message id from email triage context or list_email_inbox.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'mark_email_receipt',
              description:
                'File an inbound inbox message as a tax receipt (payment confirmation, vendor charge, etc.). Use when the email shows a dollar amount and the user wants it kept for taxes — not junk/delete.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'mark_email_routed',
              description:
                'Mark an inbound inbox message as routed/processed and remove it from the review queue. Use after you have handled the email (replied, filed to a job, scheduled, etc.) — not for spam. Requires email_id from triage context or list_email_inbox.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'delete_email',
              description:
                `Permanently remove an inbound inbox message from the ${brand.name} inbox log. Use after marking junk when the user wants it gone, or when triage says delete/spam.`,
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_email_filter_rule',
              description:
                'Create a triage rule so future mail from a sender or matching phrases is auto-classified as junk (status DELETE, no alert). Skips if an enabled rule already matches the same sender phrase.',
              parameters: {
                type: 'object',
                properties: {
                  sender: {
                    type: 'string',
                    description: 'Sender email or domain substring, e.g. wordpress@mdot.world',
                  },
                  phrases: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Optional extra match phrases (subject/body). sender is always added when provided.',
                  },
                  title: {
                    type: 'string',
                    description: 'Optional rule title shown in admin Rules UI',
                  },
                },
                additionalProperties: false,
              },
            },
          }
    ];
  },
  handlers: {
    'read_email_inbox': handle_read_email_inbox,
    'list_email_inbox': handle_list_email_inbox,
    'mark_email_junk': handle_mark_email_junk,
    'mark_email_receipt': handle_mark_email_receipt,
    'mark_email_routed': handle_mark_email_routed,
    'delete_email': handle_delete_email,
    'create_email_filter_rule': handle_create_email_filter_rule,
  },
};
