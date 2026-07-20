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

async function handle_sync_uptimerobot(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('uptime_monitoring')) {
    return JSON.stringify({ error: 'uptime_monitoring not enabled in install config features' });
  }
  if (!isUptimeRobotConfigured()) {
    return JSON.stringify({
      error: 'UptimeRobot not configured — set UPTIMEROBOT_API_KEY on the server',
    });
  }
  if (!isUptimeDbConfigured()) {
    return JSON.stringify({ error: 'DATABASE_URL not configured' });
  }
  const result = await syncUptimeMonitorsFromApi();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    synced: result.synced,
  });
}

export const uptimeModule: AgentToolModule = {
  id: 'uptime',
  enabled: (ctx) => hasFeature('uptime_monitoring'),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
      {
            type: 'function',
            function: {
              name: 'sync_uptimerobot',
              description:
                'Sync monitor status from UptimeRobot API and update the local database. Pulls all monitors with their current status and uptime ratios. Requires UPTIMEROBOT_API_KEY and DATABASE_URL.',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          }
    ];
  },
  handlers: {
    'sync_uptimerobot': handle_sync_uptimerobot,
  },
};
