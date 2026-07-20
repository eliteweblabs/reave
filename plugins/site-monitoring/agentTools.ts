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

async function handle_get_site_monitoring(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const portal = extractPortal(current.data);
  const meta = portal?.siteMonitoring;
  const siteUrl = portalSiteUrl(portal);
  const watchUuid = meta?.watchUuid?.trim();

  let watch: Record<string, unknown> | null = null;
  if (watchUuid) {
    const w = await cdGetWatch(watchUuid);
    if (w.ok) {
      watch = {
        uuid: w.watch.uuid,
        url: w.watch.url,
        title: w.watch.title,
        paused: w.watch.paused,
        last_checked: w.watch.last_checked,
        last_changed: w.watch.last_changed,
      };
    }
  }

  return JSON.stringify({
    uid: target.uid,
    name: current.data.name,
    site_url: siteUrl,
    monitoring_enabled: meta?.enabled !== false,
    watch_uuid: watchUuid ?? null,
    watch,
  });
}

async function handle_set_site_monitoring(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const existing = extractPortal(current.data) ?? {};
  const enabled = typeof args.enabled === 'boolean' ? args.enabled : true;
  const next: ClientPortal = {
    ...existing,
    siteMonitoring: {
      ...(existing.siteMonitoring ?? {}),
      enabled,
    },
  };
  const saved = await setContactPortal(target.uid, next);
  if (!saved.ok) return JSON.stringify({ error: saved.error, status: saved.status });
  return JSON.stringify({
    success: true,
    uid: target.uid,
    name: current.data.name,
    monitoring_enabled: enabled,
    site_url: portalSiteUrl(next),
    watch_uuid: next.siteMonitoring?.watchUuid ?? null,
  });
}

async function handle_recheck_site_monitoring(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const target = await resolvePortalTarget(args);
  if (!target.ok) return target.payload;

  const current = await getContact(target.uid);
  if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
  const portal = extractPortal(current.data);
  const watchUuid = portal?.siteMonitoring?.watchUuid?.trim();
  if (!watchUuid) {
    return JSON.stringify({ error: 'No ChangeDetection watch for this client (set a Site URL field first).' });
  }
  const recheck = await cdRecheckWatch(watchUuid);
  if (!recheck.ok) return JSON.stringify({ error: recheck.error });
  return JSON.stringify({ success: true, uid: target.uid, watch_uuid: watchUuid });
}

export const siteMonitoringModule: AgentToolModule = {
  id: 'siteMonitoring',
  enabled: (ctx) => hasFeature('site_monitoring') && isChangeDetectionConfigured(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
            {
              type: 'function',
              function: {
                name: 'get_site_monitoring',
                description:
                  `Get ChangeDetection.io watch status for a client. Requires a "${SITE_URL_FIELD_LABEL}" field on their portal (auto-creates a watch when saved). Identify client by uid or name.`,
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string' },
                    name: { type: 'string' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'set_site_monitoring',
                description:
                  `Enable or disable automatic change monitoring for a client's Site URL. When enabled and a "${SITE_URL_FIELD_LABEL}" portal field is set, ${brand.name} creates a ChangeDetection watch and sends push alerts on unexpected changes (deploys are suppressed).`,
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string' },
                    name: { type: 'string' },
                    enabled: {
                      type: 'boolean',
                      description: 'false = pause monitoring for this client even if Site URL is set',
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'recheck_site_monitoring',
                description:
                  'Trigger an immediate ChangeDetection recheck for a client (updates baseline after you deploy). Identify by uid or name.',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string' },
                    name: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
            }
    ];
  },
  handlers: {
    'get_site_monitoring': handle_get_site_monitoring,
    'set_site_monitoring': handle_set_site_monitoring,
    'recheck_site_monitoring': handle_recheck_site_monitoring,
  },
};
