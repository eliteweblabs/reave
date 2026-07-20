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

async function handle_list_knowledge(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const entries = await storeListKnowledge();
  return JSON.stringify({
    files: entries.map((e) => ({
      slug: e.slug,
      title: e.title,
      preview: e.preview,
      source: e.source,
      kind: e.isDefault ? 'default' : 'custom',
      ...(e.tags?.length ? { tags: e.tags } : {}),
      ...(e.updated_at ? { updated_at: e.updated_at } : {}),
    })),
  });
}

async function handle_read_knowledge(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug) return JSON.stringify({ error: 'missing slug' });
  const doc = await storeReadKnowledge(slug);
  if (!doc) {
    const all = await storeListKnowledge();
    return JSON.stringify({ error: 'unknown slug', known: all.map((e) => e.slug) });
  }
  const cap = 14_000;
  const content = doc.content.length > cap ? `${doc.content.slice(0, cap)}\n\n…(truncated)` : doc.content;
  return JSON.stringify({ slug: doc.slug, title: doc.title, content, source: doc.source });
}

async function handle_search_knowledge(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const query = String(args.query ?? '').trim();
  if (!query) return JSON.stringify({ error: 'missing query' });
  const results = await storeSearchKnowledge(query);
  return JSON.stringify({ results, count: results.length });
}

async function handle_write_knowledge(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  const title = String(args.title ?? '').trim();
  const content = String(args.content ?? '').trim();
  const tags = Array.isArray(args.tags) ? (args.tags as unknown[]).map(String) : [];
  if (!slug || !title || !content) return JSON.stringify({ error: 'slug, title, and content are required' });
  const result = await storeWriteKnowledge({ slug, title, content, tags, source: 'bot' });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, slug, title, db: isKnowledgeDbConfigured() });
}

export const knowledgeModule: AgentToolModule = {
  id: 'knowledge',
  enabled: (ctx) => true,
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
          {
            type: 'function',
            function: {
              name: 'list_knowledge',
              description:
                'List all knowledge entries (live DB + bundled fallback) with one-line previews. Use this to discover what internal docs exist before calling read_knowledge.',
              parameters: { type: 'object', properties: {}, additionalProperties: false },
            },
          },
          {
            type: 'function',
            function: {
              name: 'read_knowledge',
              description:
                'Read the full content of a knowledge entry by slug. Checks the live database first, then bundled docs.',
              parameters: {
                type: 'object',
                properties: { slug: { type: 'string', description: 'Entry slug (no .md extension)' } },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'search_knowledge',
              description:
                'Search knowledge entries by keyword or topic. Returns matching titles + previews from both the live DB and bundled docs. Use instead of list_knowledge when you have a specific topic in mind.',
              parameters: {
                type: 'object',
                properties: {
                  query: {
                    type: 'string',
                    description: 'Search terms — keywords, topic names, or a short natural-language phrase',
                  },
                },
                required: ['query'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'write_knowledge',
              description:
                'Create or update a knowledge entry in the live database. Use this to save new context, notes, playbooks, or corrections so they persist across restarts without a redeploy. Requires DATABASE_URL (Railway Postgres) to be set.',
              parameters: {
                type: 'object',
                properties: {
                  slug: {
                    type: 'string',
                    description: 'URL-safe identifier, e.g. "stripe-billing" or "client-onboarding"',
                  },
                  title: { type: 'string', description: 'Short human-readable title' },
                  content: {
                    type: 'string',
                    description: 'Full markdown content (playbook, notes, reference, etc.)',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Topic tags for search, e.g. ["billing", "stripe"]',
                  },
                },
                required: ['slug', 'title', 'content'],
                additionalProperties: false,
              },
            },
          }
    ];
  },
  handlers: {
    'list_knowledge': handle_list_knowledge,
    'read_knowledge': handle_read_knowledge,
    'search_knowledge': handle_search_knowledge,
    'write_knowledge': handle_write_knowledge,
  },
};
