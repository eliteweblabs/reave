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

async function handle_fetch_url(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });
  const result = await fetchUrl(url, args.raw === true);
  if (!result.ok) {
    return JSON.stringify({ error: result.error, ...(result.status_code ? { status_code: result.status_code } : {}) });
  }
  return JSON.stringify(result.data);
}

async function handle_lighthouse_audit(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });
  const categoryRaw = String(args.category ?? '').trim();
  const strategyRaw = String(args.strategy ?? 'both').trim();
  const result = await lighthouseAudit({
    url,
    category: ['performance', 'accessibility', 'best-practices', 'seo'].includes(categoryRaw)
      ? (categoryRaw as 'performance' | 'accessibility' | 'best-practices' | 'seo')
      : undefined,
    strategy:
      strategyRaw === 'mobile' || strategyRaw === 'desktop' || strategyRaw === 'both'
        ? strategyRaw
        : 'both',
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({
    summary: formatLighthouseResults(result),
    url: result.url,
    results: result.results,
  });
}

async function handle_ssl_check(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });
  const result = await sslCheck(url);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ...result, summary: formatSslCheckResults(result) });
}

async function handle_check_links(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return JSON.stringify({ error: 'url is required' });
  const result = await checkLinks(url, args.follow_internal === true);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ...result, summary: formatCheckLinksResults(result) });
}

async function handle_dns_check(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const domain = String(args.domain ?? '').trim();
  if (!domain) return JSON.stringify({ error: 'domain is required' });
  const result = await dnsCheck(domain);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ...result, summary: formatDnsCheckResults(result) });
}

async function handle_sync_resend_dns(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const domainArg = args.domain != null ? String(args.domain).trim().toLowerCase() : '';
  if (domainArg === 'all') {
    const result = await syncAllResendDnsToCloudflare();
    if (!result.ok) return JSON.stringify({ error: result.error });
    return JSON.stringify({ ok: true, summary: result.summary, domains: result.domains });
  }
  const domain = domainArg || _ctx.brand.domain;
  if (!domain) {
    return JSON.stringify({ error: 'Company domain is not configured (admin → Profile → Company details)' });
  }
  const result = await syncResendDnsToCloudflare(domain);
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ...result, ok: true });
}

export const siteAuditsModule: AgentToolModule = {
  id: 'siteAudits',
  enabled: (ctx) => hasFeature('site_audits'),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
            {
              type: 'function',
              function: {
                name: 'fetch_url',
                description:
                  'Fetch a public web page and return its content for review (client sites, SEO checks, error pages). Returns title, meta tags, and readable text (scripts/styles stripped). Use when the user asks to review, read, or audit a website URL. For performance use lighthouse_audit; for SSL/headers use ssl_check; for broken links use check_links; for DNS/email auth use dns_check.',
                parameters: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'Full URL or domain, e.g. https://example.com' },
                    raw: {
                      type: 'boolean',
                      description: 'If true, return raw HTML body instead of cleaned text. Default false.',
                    },
                  },
                  required: ['url'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'lighthouse_audit',
                description:
                  'Run Google PageSpeed Insights (Lighthouse) on a URL. Returns performance, accessibility, best-practices, and SEO scores (0–100), core web vitals (FCP, LCP, CLS, TBT), and top improvement opportunities. Runs mobile + desktop by default.',
                parameters: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'Full URL or domain to audit' },
                    category: {
                      type: 'string',
                      enum: ['performance', 'accessibility', 'best-practices', 'seo'],
                      description: 'Optional — audit one category only; default runs all four.',
                    },
                    strategy: {
                      type: 'string',
                      enum: ['mobile', 'desktop', 'both'],
                      description: 'Device strategy. Default both (mobile + desktop).',
                    },
                  },
                  required: ['url'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'ssl_check',
                description:
                  'Check SSL certificate validity, expiry, TLS version, and security headers (HSTS, CSP, X-Frame-Options, etc.) for a URL. Returns cert details, header audit, mixed-content warnings, and an overall grade (A–F).',
                parameters: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'Full URL or domain to check' },
                  },
                  required: ['url'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'check_links',
                description:
                  'Crawl a page and check all links for broken URLs (404s, 5xx, timeouts) and redirect chains. Returns broken link report with anchor text and status codes.',
                parameters: {
                  type: 'object',
                  properties: {
                    url: { type: 'string', description: 'Page URL to crawl' },
                    follow_internal: {
                      type: 'boolean',
                      description: 'Also crawl linked internal pages (depth 1, max 20). Default false.',
                    },
                  },
                  required: ['url'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'dns_check',
                description:
                  'Check domain DNS health, nameservers, email authentication (SPF, DKIM, DMARC), WHOIS basics, and A-record propagation across public resolvers. Read-only — does not change Cloudflare.',
                parameters: {
                  type: 'object',
                  properties: {
                    domain: { type: 'string', description: 'Domain name (no protocol), e.g. example.com' },
                  },
                  required: ['domain'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'sync_resend_dns',
                description:
                  'Ensure Resend domain DNS records (DKIM, SPF, MX, receiving) exist in Cloudflare — check and create/update as needed. Requires CLOUDFLARE_API_TOKEN + RESEND_API_KEY. Use when the user asks to verify or set Resend email DNS at Cloudflare.',
                parameters: {
                  type: 'object',
                  properties: {
                    domain: {
                      type: 'string',
                      description:
                        `Resend domain to sync, e.g. ${domainExample} or inbound.${domainExample}. Omit or set "all" to sync every Resend domain.`,
                    },
                  },
                  additionalProperties: false,
                },
              },
            }
    ];
  },
  handlers: {
    'fetch_url': handle_fetch_url,
    'lighthouse_audit': handle_lighthouse_audit,
    'ssl_check': handle_ssl_check,
    'check_links': handle_check_links,
    'dns_check': handle_dns_check,
    'sync_resend_dns': handle_sync_resend_dns,
  },
};
