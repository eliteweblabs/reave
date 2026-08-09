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
  bookingCreate,
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
    hint: `Share calcom_url for direct booking or form_url for the conversational scheduler on ${_ctx.brand.domain || 'your website'}.`,
  });
}

async function handle_create_booking(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const name = String(args.name ?? '').trim();
  const email = String(args.email ?? '').trim();
  const start = String(args.start ?? '').trim();
  const phone = typeof args.phone === 'string' ? args.phone.trim() : undefined;
  const notes = typeof args.notes === 'string' ? args.notes.trim() : undefined;
  const address = typeof args.address === 'string' ? args.address.trim() : undefined;
  const eventSlug =
    typeof args.event_slug === 'string' && args.event_slug.trim()
      ? args.event_slug.trim()
      : undefined;
  const durationRaw = args.duration_minutes;
  const durationMinutes =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? Math.round(durationRaw)
      : typeof durationRaw === 'string' && durationRaw.trim() && Number.isFinite(Number(durationRaw))
        ? Math.round(Number(durationRaw))
        : undefined;

  if (!name) return JSON.stringify({ error: 'name is required' });
  if (!email) return JSON.stringify({ error: 'email is required' });
  if (!start) return JSON.stringify({ error: 'start is required (ISO 8601 datetime)' });
  if (durationMinutes != null && (durationMinutes < 5 || durationMinutes > 480)) {
    return JSON.stringify({ error: 'duration_minutes must be between 5 and 480' });
  }

  // Validate ISO date
  const startDate = new Date(start);
  if (isNaN(startDate.getTime())) {
    return JSON.stringify({ error: `Invalid start time: "${start}". Use ISO 8601 format, e.g. 2026-08-11T13:40:00-04:00` });
  }

  const result = await bookingCreate({
    name,
    email,
    start,
    phone,
    notes,
    address,
    durationMinutes,
    eventSlug,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });

  const booking = result.data?.booking;
  const lengthMinutes = result.data?.durationMinutes ?? durationMinutes ?? 30;
  const when = new Date(booking?.startTime ?? start).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return JSON.stringify({
    success: true,
    uid: booking?.uid ?? null,
    startTime: booking?.startTime ?? start,
    duration_minutes: lengthMinutes,
    event_slug: result.data?.eventSlug ?? eventSlug ?? null,
    summary: booking?.uid
      ? `Booking created for ${name} on ${when} (${lengthMinutes} min)`
      : `Booking created for ${name} (${lengthMinutes} min)`,
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
                      description: 'Cal.com event slug, e.g. 30min, 60min, 15min. Default 30min.',
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'create_booking',
                description:
                  'Create a new Cal.com booking/appointment. Use when a user asks to schedule a meeting, create an appointment, or when an email contains a meeting request at a specific date and time. start must be a full ISO 8601 datetime with timezone offset, e.g. 2026-08-11T13:40:00-04:00 for 1:40 PM Eastern. Meetings have a fixed length (Cal.com event types) — not open-ended. Default duration is 30 minutes; when the client asks for an hour (or another length), pass duration_minutes (e.g. 60) or event_slug (e.g. 60min).',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Attendee full name' },
                    email: { type: 'string', description: 'Attendee email address' },
                    start: {
                      type: 'string',
                      description: 'Start datetime in ISO 8601 with timezone offset, e.g. 2026-08-11T13:40:00-04:00. Always include the offset — never pass a bare local time or UTC Z when the intent is a local time.',
                    },
                    duration_minutes: {
                      type: 'integer',
                      description:
                        'Meeting length in minutes (5–480). Default 30. Use 60 when the client asks for an hour, 15 for a quick call, etc. Mapped to the closest Cal.com event type.',
                    },
                    event_slug: {
                      type: 'string',
                      description:
                        'Optional Cal.com event slug (e.g. 30min, 60min). Overrides duration_minutes when set. Call get_booking_link first if you need the available event_types list.',
                    },
                    phone: { type: 'string', description: 'Optional attendee phone number' },
                    notes: { type: 'string', description: 'Optional meeting notes or agenda' },
                    address: { type: 'string', description: 'Optional meeting address (defaults to company address)' },
                  },
                  required: ['name', 'email', 'start'],
                  additionalProperties: false,
                },
              },
            },
    ];
  },
  handlers: {
    'list_bookings': handle_list_bookings,
    'get_booking': handle_get_booking,
    'get_booking_link': handle_get_booking_link,
    'create_booking': handle_create_booking,
  },
};
