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
  isLikelyEmail,
  resolvePortalTarget,
  workExtrasFromArgs,
} from '../shared';

async function handle_send_email(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isEmailSendConfigured()) {
    return JSON.stringify({ success: false, error: 'Outbound email is not configured (RESEND_API_KEY)' });
  }

  const to = String(args.to ?? '').trim();
  const subject = String(args.subject ?? '').trim();
  const body = String(args.body ?? '').trim();
  if (!to) return JSON.stringify({ success: false, error: 'to is required' });
  if (!subject) return JSON.stringify({ success: false, error: 'subject is required' });
  if (!body) return JSON.stringify({ success: false, error: 'body is required' });
  if (!isLikelyEmail(to)) {
    return JSON.stringify({ success: false, error: 'invalid to address' });
  }

  const cc = parseEmailListArg(args.cc);
  const bcc = parseEmailListArg(args.bcc);
  for (const addr of [...(cc ?? []), ...(bcc ?? [])]) {
    if (!isLikelyEmail(addr)) {
      return JSON.stringify({ success: false, error: `invalid address: ${addr}` });
    }
  }

  const from = String(args.from ?? '').trim() || undefined;
  const inReplyToEmailId = String(args.in_reply_to_email_id ?? '').trim() || null;
  let jobSlug = String(args.job_slug ?? '').trim() || null;
  let replyHeaders: Record<string, string> | undefined;

  if (inReplyToEmailId) {
    const inbound = await storeGetEmailInbox(inReplyToEmailId);
    if (!inbound) {
      return JSON.stringify({ success: false, error: 'in_reply_to_email_id not found' });
    }
    replyHeaders = buildReplyEmailHeaders(inbound);
    jobSlug = jobSlug || inbound.jobSlug || null;
  }

  const looksHtml = /<[a-z][\s\S]*>/i.test(body);
  let text = body;
  let html: string | undefined;
  if (looksHtml) {
    text = plainTextFromHtml(body) || body;
    html = body;
  } else {
    let firstName = to.split('@')[0] || 'there';
    if (inReplyToEmailId) {
      const inbound = await storeGetEmailInbox(inReplyToEmailId);
      if (inbound?.contactName) {
        firstName = inbound.contactName.trim().split(/\s+/)[0] || firstName;
      }
    }
    const wrapped = await brandedPlainTextEmail({ firstName, body });
    text = wrapped.text;
    html = wrapped.html;
  }
  const result = await sendEmail({
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    from,
    headers: replyHeaders,
  });

  if (!result.ok) return JSON.stringify({ success: false, error: result.error });
  if (inReplyToEmailId) {
    const existing = await storeGetEmailInbox(inReplyToEmailId);
    if (existing) {
      const patch: EmailInboxPatch = {
        action: 'filed',
        status: 'FILED',
      };
      if (existing.category === 'review') patch.category = 'internal';
      await storeUpdateEmailInbox(inReplyToEmailId, patch);
    }
  }
  void logOutboundEmailForProject({
    toEmail: to,
    subject,
    resendId: result.id,
    sentBy: getAgentContext().userId ?? null,
    source: inReplyToEmailId ? 'agent_reply' : 'agent_send_email',
    jobSlug,
  });
  return JSON.stringify({
    success: true,
    id: result.id,
    to,
    subject,
    threaded: Boolean(replyHeaders),
    in_reply_to_email_id: inReplyToEmailId,
  });
}

async function handle_brave_search(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isBraveConfigured()) {
    return JSON.stringify({ error: 'BRAVE_API_KEY is not set on this service' });
  }
  const query = String(args.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'missing query' });
  const result = await braveSearch(query);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return formatBraveResults(result);
}

export const outboundModule: AgentToolModule = {
  id: 'outbound',
  enabled: (ctx) => isEmailSendConfigured() || isBraveConfigured(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    const out: AgentToolDef[] = [];
    if (isEmailSendConfigured()) out.push(
      {
            type: 'function',
            function: {
              name: 'send_email',
              description:
                'Send an outbound email via Resend (same backend as POST /api/email/send). Use when the user asks you to email someone directly — not for delivering client portal links (use send_client_portal for that).',
              parameters: {
                type: 'object',
                properties: {
                  to: { type: 'string', description: 'Recipient email address' },
                  subject: { type: 'string', description: 'Email subject line' },
                  body: { type: 'string', description: 'Message body (plain text or HTML)' },
                  cc: { type: 'string', description: 'Optional CC — comma-separated addresses' },
                  bcc: { type: 'string', description: 'Optional BCC — comma-separated addresses' },
                  from: {
                    type: 'string',
                    description: 'Optional From address (defaults to RESEND_FROM / company outbound email)',
                  },
                  job_slug: {
                    type: 'string',
                    description: 'Optional project slug — logs outbound mail so client replies trigger urgent alerts',
                  },
                  in_reply_to_email_id: {
                    type: 'string',
                    description:
                      'Optional inbox email_id — adds In-Reply-To/References headers and marks the message handled after send',
                  },
                },
                required: ['to', 'subject', 'body'],
                additionalProperties: false,
              },
            },
          }
    );
    if (isBraveConfigured()) out.push(
      {
            type: 'function',
            function: {
              name: 'brave_search',
              description:
                'Search the web via Brave. Use to look up businesses, websites, people, or any public info.',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Search query' },
                },
                required: ['query'],
                additionalProperties: false,
              },
            },
          }
    );
    return out;
  },
  handlers: {
    'send_email': handle_send_email,
    'brave_search': handle_brave_search,
  },
};
