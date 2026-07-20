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
  craterSearchLineItems,
  craterRecordPayment,
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
  parseEmailListArg,
  parseLineItems,
  parsePortalFields,
  parsePortalData,
  plainTextFromHtml,
  resolvePortalTarget,
  workExtrasFromArgs,
} from '../../src/lib/agentTools/shared';

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
