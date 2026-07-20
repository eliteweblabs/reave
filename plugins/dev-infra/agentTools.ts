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

async function handle_run_dev_task(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const task = String(args.task ?? '').trim();
  if (!isDevTaskName(task)) {
    return JSON.stringify({ error: 'invalid task', allowed: DEV_TASK_NAMES });
  }
  const out = await runDevTask(task);
  if (!out.ok) return JSON.stringify({ error: out.error });
  return JSON.stringify(out);
}

async function handle_list_railway_domains(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isRailwayConfigured()) {
    return JSON.stringify({ error: 'RAILWAY_API_TOKEN is not set on this service' });
  }
  const result = await railwayListProjectNetworking({
    project: typeof args.project === 'string' ? args.project : undefined,
    environment: typeof args.environment === 'string' ? args.environment : undefined,
    service: typeof args.service === 'string' ? args.service : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    summary: formatRailwayNetworkingSummary(result.data),
    data: result.data,
  });
}

async function handle_list_kinsta_sites(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const siteId = typeof args.site_id === 'string' ? args.site_id.trim() : '';
  if (siteId) {
    const one = await kinstaGetSite(siteId);
    if (!one.ok) return JSON.stringify({ error: one.error });
    return JSON.stringify({
      ok: true,
      summary: formatKinstaSitesSummary([one.site]),
      sites: [one.site],
    });
  }
  const includeEnvironments = args.include_environments !== false;
  const result = await kinstaListSites({ includeEnvironments });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    company_id: result.company_id,
    summary: formatKinstaSitesSummary(result.sites),
    sites: result.sites,
  });
}

async function handle_clear_kinsta_cache(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const environmentId = String(args.environment_id ?? '').trim();
  const result = await kinstaClearCache(environmentId);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    operation_id: result.operation_id,
    dry_run: result.dry_run ?? false,
    hint: 'Poll get_kinsta_operation until status is has_completed or has_failed.',
  });
}

async function handle_get_kinsta_operation(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const operationId = String(args.operation_id ?? '').trim();
  const result = await kinstaGetOperation(operationId);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, status: result.status, data: result.data });
}

async function handle_create_kinsta_site(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const installMode =
    args.install_mode === 'clone' ? 'clone' : args.install_mode === 'new' ? 'new' : undefined;
  const result = await kinstaCreateSite({
    display_name: String(args.display_name ?? ''),
    region: typeof args.region === 'string' ? args.region : undefined,
    install_mode: installMode,
    source_env_id: typeof args.source_env_id === 'string' ? args.source_env_id : undefined,
    admin_email: typeof args.admin_email === 'string' ? args.admin_email : undefined,
    admin_user: typeof args.admin_user === 'string' ? args.admin_user : undefined,
    admin_password: typeof args.admin_password === 'string' ? args.admin_password : undefined,
    site_title: typeof args.site_title === 'string' ? args.site_title : undefined,
    woocommerce: args.woocommerce === true,
    wordpressseo: args.wordpressseo === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    operation_id: result.operation_id,
    dry_run: result.dry_run ?? false,
    hint: 'Poll get_kinsta_operation until has_completed (site create can take 1–3 minutes).',
  });
}

async function handle_delete_kinsta_site(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const siteId = String(args.site_id ?? '').trim();
  if (!siteId) return JSON.stringify({ error: 'site_id is required' });

  const confirmed = args.confirmed === true;
  if (!confirmed) {
    const site = await kinstaGetSite(siteId);
    if (!site.ok) return JSON.stringify({ error: site.error });
    return JSON.stringify({
      blocked: true,
      reason: 'confirmation_required',
      site_id: siteId,
      site: site.site,
      summary: formatKinstaSitesSummary([site.site]),
      warning: `Permanently delete Kinsta site "${site.site.display_name || site.site.name}" (${siteId})? This cannot be undone.`,
      hint: 'Warn the user, then re-call delete_kinsta_site with the same site_id and confirmed:true.',
    });
  }

  const result = await kinstaDeleteSite(siteId);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    operation_id: result.operation_id,
    dry_run: result.dry_run ?? false,
    site_id: siteId,
    hint: 'Poll get_kinsta_operation until has_completed.',
  });
}

async function handle_backup_kinsta_site(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const environmentId = String(args.environment_id ?? '').trim();
  const tag = typeof args.tag === 'string' ? args.tag : undefined;
  const result = await kinstaCreateManualBackup(environmentId, tag);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    operation_id: result.operation_id,
    dry_run: result.dry_run ?? false,
    hint: 'Poll get_kinsta_operation until has_completed, then list_kinsta_backups to verify.',
  });
}

async function handle_list_kinsta_backups(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isKinstaConfigured()) {
    return JSON.stringify({ error: 'KINSTA_API_KEY and KINSTA_COMPANY_ID must be set on this service' });
  }
  const environmentId = String(args.environment_id ?? '').trim();
  const result = await kinstaListBackups(environmentId);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({
    ok: true,
    environment_id: result.environment_id,
    backup_count: result.backups.length,
    backups: result.backups,
  });
}

async function handle_get_git_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await getGitStatus({
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_get_recent_commits(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await getRecentCommits({
    branch: typeof args.branch === 'string' && args.branch.trim() ? args.branch.trim() : undefined,
    limit: typeof args.limit === 'number' ? args.limit : undefined,
    with_files: args.with_files === true,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_check_deployment_status(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await checkDeploymentStatus();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_list_open_branches(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await listOpenBranches();
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_run_terminal_command(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const command = String(args.command ?? '').trim();
  if (!command) return JSON.stringify({ error: 'command is required' });
  const result = await runSafeShellCommand(command);
  if (!result.ok) return JSON.stringify({ error: result.error, allowed: describeSafeShell() });
  return JSON.stringify(result);
}

async function handle_create_github_branch(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await githubCreateBranch({
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    branch: String(args.branch ?? '').trim(),
    from_branch: typeof args.from_branch === 'string' ? args.from_branch : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_write_github_file(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await githubWriteFile({
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    branch: String(args.branch ?? '').trim(),
    path: String(args.path ?? '').trim(),
    content: String(args.content ?? ''),
    message: String(args.message ?? '').trim(),
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

async function handle_create_pull_request(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const result = await githubCreatePullRequest({
    repo: typeof args.repo === 'string' ? args.repo : undefined,
    head: String(args.head ?? '').trim(),
    base: typeof args.base === 'string' && args.base.trim() ? args.base.trim() : undefined,
    title: String(args.title ?? '').trim(),
    body: typeof args.body === 'string' ? args.body : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify(result.data);
}

export const devInfraModule: AgentToolModule = {
  id: 'devInfra',
  enabled: (ctx) => hasFeature('dev_infra'),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
          {
            type: 'function',
            function: {
              name: 'run_dev_task',
              description:
                'Run a sandboxed dev/ops task (service pings, config status). No arbitrary shell commands.',
              parameters: {
                type: 'object',
                properties: {
                  task: {
                    type: 'string',
                    enum: [...DEV_TASK_NAMES],
                    description:
                      'service_status = which integrations are configured; ping_crater / ping_contact_api / ping_railway / ping_kinsta = connectivity check; list_knowledge_slugs = bundled docs; list_railway_domains = Railway CNAME/custom domains; list_kinsta_sites = Kinsta WordPress sites/environments. Kinsta site management: list_kinsta_sites, create_kinsta_site, delete_kinsta_site, backup_kinsta_site, list_kinsta_backups, clear_kinsta_cache, get_kinsta_operation.',
                  },
                },
                required: ['task'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_railway_domains',
              description:
                `Read Railway networking for a project: *.up.railway.app domains, custom domains, CNAME targets (requiredValue), and verification TXT tokens. Use when the user asks for a CNAME target, custom domain DNS, or what domain a service is on. Requires RAILWAY_API_TOKEN. Defaults to project "${brand.projectLabel}" / environment production.`,
              parameters: {
                type: 'object',
                properties: {
                  project: {
                    type: 'string',
                    description: `Project name or UUID (default: RAILWAY_PROJECT_ID env or "${brand.projectLabel}")`,
                  },
                  environment: { type: 'string', description: 'Environment name (default: production)' },
                  service: {
                    type: 'string',
                    description: 'Optional service name filter, e.g. "reave" or "contact-api"',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_kinsta_sites',
              description:
                'List WordPress sites on Kinsta for the configured company (KINSTA_API_KEY + KINSTA_COMPANY_ID). Returns site ids, statuses, and optionally live/staging environment ids, primary domains, and PHP versions. Use for Kinsta hosting questions, finding environment_id before cache clears, or client site inventory.',
              parameters: {
                type: 'object',
                properties: {
                  include_environments: {
                    type: 'boolean',
                    description: 'Include live/staging environment details (default true)',
                  },
                  site_id: {
                    type: 'string',
                    description: 'Optional: fetch one site by id instead of listing all',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'clear_kinsta_cache',
              description:
                'Clear Kinsta site cache for a specific environment_id (from list_kinsta_sites). Returns operation_id — poll with get_kinsta_operation. Requires KINSTA_API_KEY.',
              parameters: {
                type: 'object',
                properties: {
                  environment_id: {
                    type: 'string',
                    description: 'Kinsta environment UUID (live or staging)',
                  },
                },
                required: ['environment_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_kinsta_operation',
              description:
                'Check status of an async Kinsta API operation (site create, cache clear, backup, etc.). Status values include has_completed and has_failed.',
              parameters: {
                type: 'object',
                properties: {
                  operation_id: { type: 'string', description: 'operation_id from a prior Kinsta tool call' },
                },
                required: ['operation_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_kinsta_site',
              description:
                'Create a new Kinsta WordPress site (fresh install or clone from an existing environment). Returns operation_id — poll with get_kinsta_operation (provisioning often takes 1–3 minutes). Requires KINSTA_API_KEY + KINSTA_COMPANY_ID.',
              parameters: {
                type: 'object',
                properties: {
                  display_name: { type: 'string', description: 'Site label in MyKinsta (e.g. client name)' },
                  region: {
                    type: 'string',
                    description: 'GCP region for new installs (default us-central1). Examples: us-east1, europe-west1.',
                  },
                  install_mode: {
                    type: 'string',
                    enum: ['new', 'clone'],
                    description: 'new = fresh WordPress; clone = copy from source_env_id',
                  },
                  source_env_id: {
                    type: 'string',
                    description: 'Required when install_mode is clone — environment to copy from',
                  },
                  admin_email: { type: 'string', description: 'WP admin email (required for install_mode new)' },
                  admin_user: { type: 'string', description: 'WP admin username (required for install_mode new)' },
                  admin_password: { type: 'string', description: 'WP admin password (required for install_mode new)' },
                  site_title: { type: 'string', description: 'WordPress site title (defaults to display_name)' },
                  woocommerce: { type: 'boolean', description: 'Pre-install WooCommerce (default false)' },
                  wordpressseo: { type: 'boolean', description: 'Pre-install Yoast SEO (default false)' },
                },
                required: ['display_name'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'delete_kinsta_site',
              description:
                'Permanently delete a Kinsta WordPress site by site_id. Destructive and irreversible — warn the user and require confirmed:true before calling.',
              parameters: {
                type: 'object',
                properties: {
                  site_id: { type: 'string', description: 'Kinsta site UUID from list_kinsta_sites' },
                  confirmed: {
                    type: 'boolean',
                    description: 'Must be true after the user explicitly confirms deletion',
                  },
                },
                required: ['site_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'backup_kinsta_site',
              description:
                'Create a manual backup for a Kinsta environment. Returns operation_id — poll with get_kinsta_operation. Use list_kinsta_backups to see existing backups first.',
              parameters: {
                type: 'object',
                properties: {
                  environment_id: {
                    type: 'string',
                    description: 'Kinsta environment UUID (live or staging) from list_kinsta_sites',
                  },
                  tag: { type: 'string', description: 'Optional short label to identify this backup later' },
                },
                required: ['environment_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_kinsta_backups',
              description:
                'List manual, scheduled, and system backups for a Kinsta environment. Use before restore or to verify a backup_kinsta_site completed.',
              parameters: {
                type: 'object',
                properties: {
                  environment_id: {
                    type: 'string',
                    description: 'Kinsta environment UUID from list_kinsta_sites',
                  },
                },
                required: ['environment_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_git_status',
              description:
                'Snapshot of the GitHub repo (source of truth): current/default branch, latest commits, branch count, and whether the live deploy is on the latest commit. Use to verify work was committed & pushed. Local uncommitted/unstaged changes are NOT visible here — use run_terminal_command on a checked-out repo for that.',
              parameters: {
                type: 'object',
                properties: {
                  branch: { type: 'string', description: 'Branch to inspect; defaults to the repo default branch.' },
                  limit: { type: 'integer', description: 'How many recent commits to include (1-30, default 8).' },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_recent_commits',
              description:
                'Recent commit history from GitHub (author, message, timestamp, link; optionally files changed). Use to verify whether specific work landed.',
              parameters: {
                type: 'object',
                properties: {
                  branch: { type: 'string', description: 'Branch to read; defaults to the repo default branch.' },
                  limit: { type: 'integer', description: 'Number of commits (1-30, default 5).' },
                  with_files: { type: 'boolean', description: 'Include changed files + stats per commit (slower).' },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'check_deployment_status',
              description:
                'Is the latest pushed code actually live? Compares the deployed commit (Railway RAILWAY_GIT_COMMIT_SHA) to GitHub’s latest commit on the default branch and pings the public health endpoint. Returns a one-line summary plus details.',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_open_branches',
              description:
                'List active branches on GitHub with how far each is ahead/behind the default branch. Use to track in-progress work.',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
          {
            type: 'function',
            function: {
              name: 'run_terminal_command',
              description:
                `Run a single READ-ONLY shell command in a sandbox (no shell, no pipes/redirects/chaining). Allowed binaries: ${describeSafeShell().binaries.join(', ')}; git is limited to read-only subcommands (${describeSafeShell().git_subcommands.join(', ')}). Useful where the repo is checked out; on the live container there may be no git checkout.`,
              parameters: {
                type: 'object',
                properties: {
                  command: { type: 'string', description: 'e.g. "git log --oneline -10", "git status", "git branch -a", "ls".' },
                },
                required: ['command'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_github_branch',
              description:
                `Create a new branch from an existing branch (default from_branch: ${githubDefaultBranch()}). Use before write_github_file when no feature branch exists yet. Requires GITHUB_TOKEN with Contents write.`,
              parameters: {
                type: 'object',
                properties: {
                  repo: {
                    type: 'string',
                    description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
                  },
                  branch: { type: 'string', description: 'New branch name, e.g. feature/fix-typo' },
                  from_branch: {
                    type: 'string',
                    description: `Existing branch to branch from (defaults to ${githubDefaultBranch()})`,
                  },
                },
                required: ['branch'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'write_github_file',
              description:
                'Create or update a file in a GitHub repo via the Contents API. Commits directly to the given branch (branch must already exist). Requires GITHUB_TOKEN with Contents write. Returns commit SHA and URL.',
              parameters: {
                type: 'object',
                properties: {
                  repo: {
                    type: 'string',
                    description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
                  },
                  branch: { type: 'string', description: 'Target branch to commit to' },
                  path: { type: 'string', description: 'File path in the repo, e.g. src/lib/example.ts' },
                  content: { type: 'string', description: 'Full new file contents (UTF-8 text)' },
                  message: { type: 'string', description: 'Git commit message' },
                },
                required: ['branch', 'path', 'content', 'message'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_pull_request',
              description:
                'Open a pull request on GitHub. Use after write_github_file commits on a feature branch. Requires GITHUB_TOKEN with Pull requests write.',
              parameters: {
                type: 'object',
                properties: {
                  repo: {
                    type: 'string',
                    description: `owner/repo (defaults to ${githubRepoSlug()} when omitted)`,
                  },
                  head: { type: 'string', description: 'Head branch (the branch with your changes)' },
                  base: {
                    type: 'string',
                    description: `Base branch to merge into (defaults to ${githubDefaultBranch()})`,
                  },
                  title: { type: 'string', description: 'PR title' },
                  body: { type: 'string', description: 'PR description (markdown ok)' },
                },
                required: ['head', 'title'],
                additionalProperties: false,
              },
            },
          }
    ];
  },
  handlers: {
    'run_dev_task': handle_run_dev_task,
    'list_railway_domains': handle_list_railway_domains,
    'list_kinsta_sites': handle_list_kinsta_sites,
    'clear_kinsta_cache': handle_clear_kinsta_cache,
    'get_kinsta_operation': handle_get_kinsta_operation,
    'create_kinsta_site': handle_create_kinsta_site,
    'delete_kinsta_site': handle_delete_kinsta_site,
    'backup_kinsta_site': handle_backup_kinsta_site,
    'list_kinsta_backups': handle_list_kinsta_backups,
    'get_git_status': handle_get_git_status,
    'get_recent_commits': handle_get_recent_commits,
    'check_deployment_status': handle_check_deployment_status,
    'list_open_branches': handle_list_open_branches,
    'run_terminal_command': handle_run_terminal_command,
    'create_github_branch': handle_create_github_branch,
    'write_github_file': handle_write_github_file,
    'create_pull_request': handle_create_pull_request,
  },
};
