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
