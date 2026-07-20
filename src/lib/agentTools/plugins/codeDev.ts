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
