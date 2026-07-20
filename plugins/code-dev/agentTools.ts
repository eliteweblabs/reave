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

async function handle_read_file(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('code_dev')) return JSON.stringify({ error: 'code_dev feature not enabled' });
  const result = codeDevReadFile(String(args.path ?? ''));
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_write_file(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('code_dev')) return JSON.stringify({ error: 'code_dev feature not enabled' });
  const result = codeDevWriteFile(String(args.path ?? ''), String(args.content ?? ''));
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_list_files(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('code_dev')) return JSON.stringify({ error: 'code_dev feature not enabled' });
  const result = codeDevListFiles(
    typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '.',
    args.recursive === true,
  );
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_exec_command(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!hasFeature('code_dev')) return JSON.stringify({ error: 'code_dev feature not enabled' });
  const result = await codeDevExecCommand(String(args.command ?? ''));
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

export const codeDevModule: AgentToolModule = {
  id: 'codeDev',
  enabled: (ctx) => hasFeature('code_dev'),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
            {
              type: 'function',
              function: {
                name: 'read_file',
                description:
                  'Read a file from the local project filesystem (path relative to repo root). Use before editing. Reave code_dev only.',
                parameters: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'Repo-relative path, e.g. src/components/Chat.tsx',
                    },
                  },
                  required: ['path'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'write_file',
                description:
                  'Write or update a file on the local project filesystem. Creates parent directories as needed. Read the file first when updating. Reave code_dev only. Commit and push after changes.',
                parameters: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'Repo-relative path to create or overwrite',
                    },
                    content: {
                      type: 'string',
                      description: 'Full new file contents (UTF-8 text)',
                    },
                  },
                  required: ['path', 'content'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'list_files',
                description:
                  'List directory contents in the local project (skips node_modules, .git, dist). Use to explore structure before editing. Reave code_dev only.',
                parameters: {
                  type: 'object',
                  properties: {
                    path: {
                      type: 'string',
                      description: 'Repo-relative directory path (default ".")',
                    },
                    recursive: {
                      type: 'boolean',
                      description: 'If true, walk subdirectories (default false)',
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'exec_command',
                description:
                  'Execute a shell command in the project root (git, npm, node, etc.). Prefer this over run_terminal_command when you need writes, installs, or tests. Reave code_dev only. Commit and push after successful code changes.',
                parameters: {
                  type: 'object',
                  properties: {
                    command: {
                      type: 'string',
                      description: 'Shell command, e.g. "git status", "npm test", "npx tsc --noEmit"',
                    },
                  },
                  required: ['command'],
                  additionalProperties: false,
                },
              },
            }
    ];
  },
  handlers: {
    'read_file': handle_read_file,
    'write_file': handle_write_file,
    'list_files': handle_list_files,
    'exec_command': handle_exec_command,
  },
};
