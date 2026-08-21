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
import { railwayAgentToolDefinitions, railwayAgentToolHandlers } from './railwayAgentTools';
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
import { describeSafeShell, runSafeShellCommand } from '../../src/lib/safeShell';
import { githubPublishDefinitions, githubPublishHandlers } from '../content-management/githubAgentTools';
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
import { cloudflareDnsManage } from '../../src/lib/cloudflareDnsManage';
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

async function handle_run_terminal_command(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const command = String(args.command ?? '').trim();
  if (!command) return JSON.stringify({ error: 'command is required' });
  const result = await runSafeShellCommand(command);
  if (!result.ok) return JSON.stringify({ error: result.error, allowed: describeSafeShell() });
  return JSON.stringify(result);
}

async function handle_cloudflare_dns(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const actionRaw = String(args.action ?? '').trim();
  const validActions = [
    'verify',
    'list_records',
    'upsert_record',
    'delete_record',
    'get_ssl_mode',
    'set_ssl_mode',
    'create_redirect_rule',
    'create_zone',
    'setup_google_workspace',
  ];
  if (!validActions.includes(actionRaw)) {
    return JSON.stringify({
      error: `action must be one of: ${validActions.join(', ')}`,
    });
  }
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });

  const result = await cloudflareDnsManage({
    action: actionRaw as
      | 'verify'
      | 'list_records'
      | 'upsert_record'
      | 'delete_record'
      | 'get_ssl_mode'
      | 'set_ssl_mode'
      | 'create_redirect_rule'
      | 'create_zone'
      | 'setup_google_workspace',
    domain,
    type: args.type != null ? String(args.type) : undefined,
    name: args.name != null ? String(args.name) : undefined,
    content: args.content != null ? String(args.content) : undefined,
    priority: typeof args.priority === 'number' ? args.priority : undefined,
    record_id: args.record_id != null ? String(args.record_id) : undefined,
    ssl_mode: args.ssl_mode != null ? String(args.ssl_mode) : undefined,
    proxied: typeof args.proxied === 'boolean' ? args.proxied : undefined,
    // redirect rule fields
    redirect_hostname: args.redirect_hostname != null ? String(args.redirect_hostname) : undefined,
    redirect_expression: args.redirect_expression != null ? String(args.redirect_expression) : undefined,
    redirect_status_code:
      args.redirect_status_code === 302 ? 302 : args.redirect_status_code === 301 ? 301 : undefined,
    preserve_query_string: typeof args.preserve_query_string === 'boolean' ? args.preserve_query_string : undefined,
    redirect_description: args.redirect_description != null ? String(args.redirect_description) : undefined,
    // create_zone fields
    jump_start: typeof args.jump_start === 'boolean' ? args.jump_start : undefined,
    verification_txt: args.verification_txt != null ? String(args.verification_txt) : undefined,
    replace_existing_mx: typeof args.replace_existing_mx === 'boolean' ? args.replace_existing_mx : undefined,
  });
  if (!result.ok) {
    return JSON.stringify({ error: result.error, ...(result.hint ? { hint: result.hint } : {}) });
  }
  return JSON.stringify({ ok: true, ...result });
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
                      'service_status = which integrations are configured; ping_crater / ping_contact_api / ping_railway / ping_kinsta = connectivity check; list_knowledge_slugs = bundled docs; list_railway_* tools = Railway projects/services/variables/domains/deployments/logs; list_kinsta_sites = Kinsta WordPress sites/environments. Kinsta site management: list_kinsta_sites, create_kinsta_site, delete_kinsta_site, backup_kinsta_site, list_kinsta_backups, clear_kinsta_cache, get_kinsta_operation.',
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
                    description:
                      'GCP region for new installs (default us-central1). Examples: us-east1, europe-west1.',
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
                  admin_email: {
                    type: 'string',
                    description: 'WP admin email (required for install_mode new)',
                  },
                  admin_user: {
                    type: 'string',
                    description: 'WP admin username (required for install_mode new)',
                  },
                  admin_password: {
                    type: 'string',
                    description: 'WP admin password (required for install_mode new)',
                  },
                  site_title: {
                    type: 'string',
                    description: 'WordPress site title (defaults to display_name)',
                  },
                  woocommerce: {
                    type: 'boolean',
                    description: 'Pre-install WooCommerce (default false)',
                  },
                  wordpressseo: {
                    type: 'boolean',
                    description: 'Pre-install Yoast SEO (default false)',
                  },
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
              name: 'run_terminal_command',
              description:
                'Run a single READ-ONLY shell command in a sandbox (no shell, no pipes/redirects/chaining). Allowed binaries: git, ls, pwd; git is limited to read-only subcommands (status, log, diff, show, branch, rev-parse, remote, describe, shortlog, ls-files, config). Useful where the repo is checked out; on the live container there may be no git binary.',
              parameters: {
                type: 'object',
                properties: {
                  command: {
                    type: 'string',
                    description:
                      'e.g. "git log --oneline -10", "git status", "git branch -a", "ls".',
                  },
                },
                required: ['command'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'cloudflare_dns',
              description:
                'Manage Cloudflare DNS and SSL/TLS for any zone this token can access (client domains, company domain, etc.). ALWAYS call verify or list_records before telling the user you lack access. When the user asks to set up Google Workspace / Gmail / Google mail for a domain, call setup_google_workspace in this same turn — do NOT ask if Workspace is purchased or for MX/SPF (those records are standard). Other actions: upsert_record (SPF, DMARC, MX, CNAME — pass proxied:true to enable orange-cloud proxy), delete_record (by record_id from list_records, or type+name+content), get_ssl_mode / set_ssl_mode (off, flexible, full, strict — use flexible to fix Error 525 when origin cert is broken), create_redirect_rule (Cloudflare Redirect Rules / Rulesets API — use to redirect www → apex or other dynamic 301/302s without touching Railway), create_zone (add a new domain to Cloudflare — returns the assigned nameservers to set at the registrar). When the user approves a Cloudflare fix, call the tool in the same turn — never hand off to the dashboard unless the tool errors. Requires CLOUDFLARE_API_TOKEN with Zone → DNS → Read/Edit and Zone → Zone Settings → Read/Edit. NOT Resend-only — sync_resend_dns is separate.',
              parameters: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: [
                      'verify',
                      'list_records',
                      'upsert_record',
                      'delete_record',
                      'get_ssl_mode',
                      'set_ssl_mode',
                      'create_redirect_rule',
                      'create_zone',
                      'setup_google_workspace',
                    ],
                    description:
                      'verify = token + zone reachable; list_records = current Cloudflare DNS (includes record ids); upsert_record = create/update one record (pass proxied:true for orange cloud); delete_record = remove one record; get_ssl_mode / set_ssl_mode = read or change SSL/TLS encryption mode (fixes Error 525 when origin cert is invalid — set flexible as stopgap); create_redirect_rule = add/update a dynamic redirect rule (www → apex, etc.) via the Rulesets API; create_zone = add a new domain to this Cloudflare account and return the nameservers to set at the registrar; setup_google_workspace = push the 5 standard Google MX records + SPF (and a starter DMARC if missing) in one call — use this instead of asking the user to paste records',
                  },
                  domain: {
                    type: 'string',
                    description: 'Zone apex or hostname, e.g. tonybarlettajr.com',
                  },
                  type: {
                    type: 'string',
                    description: 'Record type for list_records filter, upsert_record, or delete_record (TXT, MX, CNAME, A, …)',
                  },
                  name: {
                    type: 'string',
                    description: 'Record name relative to zone (@ for apex, _dmarc for DMARC). Default @.',
                  },
                  content: {
                    type: 'string',
                    description: 'Record content/value — required for upsert_record; optional disambiguator for delete_record',
                  },
                  priority: {
                    type: 'number',
                    description: 'MX priority when type is MX',
                  },
                  record_id: {
                    type: 'string',
                    description: 'Cloudflare DNS record id from list_records — preferred for delete_record',
                  },
                  ssl_mode: {
                    type: 'string',
                    enum: ['off', 'flexible', 'full', 'strict'],
                    description: 'SSL/TLS encryption mode — required for set_ssl_mode',
                  },
                  proxied: {
                    type: 'boolean',
                    description: 'Set true to enable Cloudflare orange-cloud proxy on a CNAME or A record (upsert_record). Default false (grey cloud / DNS-only).',
                  },
                  redirect_hostname: {
                    type: 'string',
                    description: 'For create_redirect_rule: the hostname to match, e.g. www.thebarbersedge.com',
                  },
                  redirect_expression: {
                    type: 'string',
                    description: 'For create_redirect_rule: dynamic URL expression, e.g. concat("https://thebarbersedge.com", http.request.uri.path)',
                  },
                  redirect_status_code: {
                    type: 'number',
                    enum: [301, 302],
                    description: 'HTTP redirect status code (default 301)',
                  },
                  preserve_query_string: {
                    type: 'boolean',
                    description: 'For create_redirect_rule: preserve query string on redirect (default true)',
                  },
                  redirect_description: {
                    type: 'string',
                    description: 'Optional label for the redirect rule shown in Cloudflare dashboard',
                  },
                  jump_start: {
                    type: 'boolean',
                    description: 'For create_zone: auto-scan existing DNS records when adding the domain (default true)',
                  },
                  verification_txt: {
                    type: 'string',
                    description:
                      'Optional Google domain-verification TXT (full google-site-verification=… value, or just the token). Only for setup_google_workspace. Do not wait for this — push MX/SPF first.',
                  },
                  replace_existing_mx: {
                    type: 'boolean',
                    description:
                      'For setup_google_workspace: remove non-Google MX at the apex so Workspace becomes the mail host (default true). Set false only to add Google MX alongside existing mail hosts.',
                  },
                },
                required: ['action', 'domain'],
                additionalProperties: false,
              },
            },
          },
          ...railwayAgentToolDefinitions(ctx),
    ];
  },
  handlers: {
    'run_dev_task': handle_run_dev_task,
    ...railwayAgentToolHandlers,
    'list_kinsta_sites': handle_list_kinsta_sites,
    'clear_kinsta_cache': handle_clear_kinsta_cache,
    'get_kinsta_operation': handle_get_kinsta_operation,
    'create_kinsta_site': handle_create_kinsta_site,
    'delete_kinsta_site': handle_delete_kinsta_site,
    'backup_kinsta_site': handle_backup_kinsta_site,
    'list_kinsta_backups': handle_list_kinsta_backups,
    'run_terminal_command': handle_run_terminal_command,
    ...githubPublishHandlers,
    'cloudflare_dns': handle_cloudflare_dns,
  },
};
