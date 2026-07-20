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

async function handle_list_bookings(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const upcoming = args.upcoming !== false;
  const limit = typeof args.limit === 'number' ? Math.min(Math.max(args.limit, 1), 50) : 15;
  const result = await bookingList({ upcoming, status: 'accepted', limit });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({
    count: result.data.bookings.length,
    upcoming,
    bookings: result.data.bookings.map((b) => ({
      uid: b.uid,
      summary: formatBookingLine(b),
      startTime: b.startTime,
      attendee: b.attendee,
      email: b.email,
      location: b.location || null,
      status: b.status,
    })),
  });
}

async function handle_get_booking(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const uid = String(args.uid ?? '').trim();
  if (!uid) return JSON.stringify({ error: 'uid is required' });
  const result = await bookingGet(uid);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  const b = result.data.booking;
  return JSON.stringify({
    booking: {
      ...b,
      summary: formatBookingLine(b),
      calcom_admin: calcomWebappUrl() ? `${calcomWebappUrl()}/bookings/${uid}` : null,
    },
  });
}

async function handle_get_booking_link(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = typeof args.event_slug === 'string' && args.event_slug.trim()
    ? args.event_slug.trim()
    : '30min';
  const types = await bookingEventTypes();
  const eventTypes = types.ok ? types.data.eventTypes : [];
  const calUrl = publicBookingPageUrl(slug);
  return JSON.stringify({
    event_slug: slug,
    calcom_url: calUrl,
    form_url: '/form/schedule',
    event_types: eventTypes.map((e) => ({ slug: e.slug, title: e.title, length: e.length })),
    hint: `Share calcom_url for direct booking or form_url for the conversational scheduler on ${_ctx.brand.domain || 'your site'}.`,
  });
}

export const schedulingModule: AgentToolModule = {
  id: 'scheduling',
  enabled: (ctx) => hasFeature('scheduling') && isBookingConfigured(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
            {
              type: 'function',
              function: {
                name: 'list_bookings',
                description:
                  'List Cal.com bookings (upcoming by default). Use when the user asks what is on the calendar, today\'s meetings, or upcoming appointments.',
                parameters: {
                  type: 'object',
                  properties: {
                    upcoming: {
                      type: 'boolean',
                      description: 'true = future bookings only (default). false = recent past 30 days.',
                    },
                    limit: { type: 'integer', description: 'Max results (1-50, default 15)' },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'get_booking',
                description: 'Fetch one Cal.com booking by uid (from list_bookings).',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Booking uid' },
                  },
                  required: ['uid'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'get_booking_link',
                description:
                  `Get the public Cal.com booking URL to share with a client (default 30 min meeting). Also returns ${brand.siteUrl.replace(/\/$/, '')}/form/schedule conversational form link.`,
                parameters: {
                  type: 'object',
                  properties: {
                    event_slug: {
                      type: 'string',
                      description: 'Cal.com event slug, e.g. 30min, 15min. Default 30min.',
                    },
                  },
                  additionalProperties: false,
                },
              },
            }
    ];
  },
  handlers: {
    'list_bookings': handle_list_bookings,
    'get_booking': handle_get_booking,
    'get_booking_link': handle_get_booking_link,
  },
};
