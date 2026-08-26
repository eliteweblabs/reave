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
import { dismissEmailRelatedNotifications } from '../../emailNotificationSync';
import { patchForMarkJunk } from '../../emailJunkNotifyInvariant';
import { extractMonetaryAmountFromEmail, formatUsdAmount } from '../../emailMoney';
import { auditForManualReceiptMark } from '../../emailClassificationAudit';
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
import {
  isEmailRuleExpired,
  parseExpiresAt,
  storeCreateEmailRule,
  storeDeleteEmailRule,
  storeListEmailRules,
  storeUpdateEmailRule,
} from '../../emailRuleStore';
import {
  defaultEmailFilterRuleStatus,
  defaultEmailFilterRuleTitle,
  planEmailFilterRuleWrite,
} from '../../emailFilterRuleWrite';
import {
  findKeywordCollidingRule,
  isRepoCatalogRule,
  type MatchMode,
  type RuleField,
} from '../../emailRules';
import { MAX_AGENT_EMAIL_BODY } from '../../emailAgentContext';
import { formatLighthouseResults, lighthouseAudit } from '../../lighthouseClient';
import { sslCheck, formatSslCheckResults } from '../../sslCheckClient';
import { checkLinks, formatCheckLinksResults } from '../../checkLinksClient';
import { dnsCheck, formatDnsCheckResults } from '../../dnsCheckClient';
import { hasFeature } from '../../features';
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

async function handle_read_email_inbox(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const ctx = getAgentContext();
  const emailId = String(args.email_id ?? ctx.emailId ?? '').trim();
  if (!emailId) {
    return JSON.stringify({ error: 'email_id is required (or open this chat from an inbox message)' });
  }
  const event = await storeGetEmailInbox(emailId);
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  const rawBody = event.bodyText?.trim() || event.bodySnippet?.trim() || '';
  const bodyText =
    rawBody.length > MAX_AGENT_EMAIL_BODY
      ? `${rawBody.slice(0, MAX_AGENT_EMAIL_BODY)}\n…[truncated]`
      : rawBody;
  const headersJson = event.headers ? JSON.stringify(event.headers) : '';
  const headers =
    headersJson && headersJson.length > 4_000 ? undefined : event.headers;
  return JSON.stringify({
    id: event.id,
    from: event.from,
    to: event.to,
    cc: event.cc,
    bcc: event.bcc,
    replyTo: event.replyTo,
    messageId: event.messageId,
    subject: event.subject,
    category: event.category,
    summary: event.summary,
    bodyText,
    bodySnippet: event.bodySnippet,
    ...(headers ? { headers } : {}),
    ...(headersJson.length > 4_000 ? { headers_note: 'Raw headers omitted (too large)' } : {}),
    routeNote: event.routeNote,
    receivedAt: event.receivedAt,
    jobSlug: event.jobSlug,
    jobTitle: event.jobTitle,
  });
}

async function handle_list_email_inbox(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const q = String(args.q ?? '').trim().toLowerCase();
  const includeJunk = args.include_junk === true;
  const limitRaw = Number(args.limit);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.floor(limitRaw), 1), 100) : 20;
  let events = await storeListEmailInbox(Math.max(limit, 100), { hideJunk: !includeJunk });
  if (q) {
    events = events.filter((e) => {
      const hay = `${e.from} ${e.subject} ${e.summary} ${e.bodySnippet} ${e.bodyText}`.toLowerCase();
      return hay.includes(q);
    });
  }
  events = events.slice(0, limit);
  return JSON.stringify({
    count: events.length,
    events: events.map((e) => ({
      id: e.id,
      from: e.from,
      subject: e.subject,
      category: e.category,
      summary: e.summary,
      receivedAt: e.receivedAt,
    })),
  });
}

async function handle_mark_email_junk(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const existing = await storeGetEmailInbox(emailId);
  if (!existing) return JSON.stringify({ error: 'not found', email_id: emailId });
  // Hard rule: junk and live dashboard notifications cannot coexist.
  const event = await storeUpdateEmailInbox(emailId, patchForMarkJunk(existing));
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  await dismissEmailRelatedNotifications(emailId, { markAutomationAck: false }).catch(() => undefined);
  return JSON.stringify({ ok: true, email_id: emailId, category: event.category, action: event.action });
}

async function handle_mark_email_receipt(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const existing = await storeGetEmailInbox(emailId);
  if (!existing) return JSON.stringify({ error: 'not found', email_id: emailId });
  const amount = extractMonetaryAmountFromEmail(existing);
  const routeNote =
    amount != null ? `Tax receipt — ${formatUsdAmount(amount)}` : 'Tax receipt';
  const event = await storeUpdateEmailInbox(emailId, {
    category: 'receipt',
    action: 'receipt',
    status: 'RECEIPT',
    routeNote,
    classificationAudit: auditForManualReceiptMark({ source: 'agent', amount }),
  });
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({
    ok: true,
    email_id: emailId,
    category: event.category,
    action: event.action,
    routeNote: event.routeNote,
    monetary_amount: amount,
  });
}

async function handle_mark_email_routed(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  const existing = await storeGetEmailInbox(emailId);
  if (!existing) return JSON.stringify({ error: 'not found', email_id: emailId });
  const patch: EmailInboxPatch = {
    action: 'filed',
    status: 'FILED',
  };
  if (existing.category === 'review') patch.category = 'internal';
  const event = await storeUpdateEmailInbox(emailId, patch);
  if (!event) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({
    ok: true,
    email_id: emailId,
    category: event.category,
    action: event.action,
    routed: true,
  });
}

async function handle_delete_email(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const emailId = String(args.email_id ?? '').trim();
  if (!emailId) return JSON.stringify({ error: 'email_id is required' });
  await dismissEmailRelatedNotifications(emailId, { markAutomationAck: false }).catch(() => undefined);
  const deleted = await storeDeleteEmailInbox(emailId);
  if (!deleted) return JSON.stringify({ error: 'not found', email_id: emailId });
  return JSON.stringify({ ok: true, email_id: emailId, deleted: true });
}

function resolveRuleExpiresAt(args: Record<string, unknown>): string | null | undefined {
  const expiresRaw = args.expires_at ?? args.expiresAt;
  if (expiresRaw != null && String(expiresRaw).trim() !== '') {
    return parseExpiresAt(expiresRaw);
  }
  const secsRaw = args.expires_in_seconds ?? args.expiresInSeconds;
  if (secsRaw != null && secsRaw !== '') {
    const secs = Number(secsRaw);
    if (!Number.isFinite(secs) || secs <= 0) return undefined;
    return new Date(Date.now() + secs * 1000).toISOString();
  }
  const daysRaw = args.expires_in_days ?? args.expiresInDays;
  if (daysRaw == null || daysRaw === '') return null;
  const days = Number(daysRaw);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function handle_list_email_filter_rules(_args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const config = await storeListEmailRules();
  const now = Date.now();
  const rules = config.rules.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    scope: r.scope === 'universal' ? 'universal' : 'personal',
    description: r.description ?? null,
    phrases: r.phrases,
    exceptPhrases: r.exceptPhrases ?? [],
    fields: r.fields,
    matchMode: r.matchMode,
    enabled: r.enabled,
    expired: isEmailRuleExpired(r, now),
    expiresAt: r.expiresAt ?? null,
    forwardTo: r.forwardTo ?? null,
    createProject: r.createProject === true,
    createdAt: r.createdAt ?? null,
  }));
  return JSON.stringify({
    ok: true,
    count: rules.length,
    notifyOnUnmatched: config.notifyOnUnmatched,
    rules,
  });
}

async function handle_create_email_filter_rule(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const sender = String(args.sender ?? '').trim().toLowerCase();
  const extra = Array.isArray(args.phrases)
    ? (args.phrases as unknown[]).map((p) => String(p).trim()).filter(Boolean)
    : [];
  const exceptExtra = Array.isArray(args.except_phrases)
    ? (args.except_phrases as unknown[]).map((p) => String(p).trim()).filter(Boolean)
    : Array.isArray(args.exceptPhrases)
      ? (args.exceptPhrases as unknown[]).map((p) => String(p).trim()).filter(Boolean)
      : [];
  const phrases = [...new Set([...(sender ? [sender] : []), ...extra])];
  if (!phrases.length) return JSON.stringify({ error: 'sender or phrases required' });

  const expiresAt = resolveRuleExpiresAt(args);
  if (expiresAt === undefined) {
    return JSON.stringify({ error: 'expires_at / expires_in_seconds / expires_in_days is invalid' });
  }

  const forwardRaw = args.forward_to ?? args.forwardTo;
  const forwardTo =
    forwardRaw != null && String(forwardRaw).trim() ? String(forwardRaw).trim() : null;
  const createProjectRaw = args.create_project ?? args.createProject;
  const createProject = createProjectRaw === true || createProjectRaw === 'true';
  const statusRaw = String(args.status ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  const status = defaultEmailFilterRuleStatus({ statusRaw, forwardTo });
  const title = defaultEmailFilterRuleTitle({
    title: String(args.title ?? '').trim(),
    sender,
    phrases,
    forwardTo,
  });

  const config = await storeListEmailRules();
  const needle = phrases[0].toLowerCase();
  const existingFromSender = config.rules.find(
    (r) =>
      r.enabled &&
      r.fields.includes('from' as RuleField) &&
      r.phrases.some((p) => p.toLowerCase() === needle),
  );
  const keywordHit = findKeywordCollidingRule(config.rules, phrases);
  const existing = existingFromSender ?? keywordHit?.rule ?? null;
  const plan = planEmailFilterRuleWrite({
    existing: existing
      ? {
          forwardTo: existing.forwardTo ?? null,
          createProject: existing.createProject === true,
          status: existing.status,
          catalog: isRepoCatalogRule(existing),
        }
      : null,
    forwardTo,
    createProject,
    statusRaw,
  });

  if (plan === 'skip' && existing) {
    return JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'rule already exists',
      rule: {
        id: existing.id,
        title: existing.title,
        phrases: existing.phrases,
        forwardTo: existing.forwardTo ?? null,
        createProject: existing.createProject === true,
        expiresAt: existing.expiresAt ?? null,
      },
    });
  }

  if (plan === 'update' && existing) {
    const updatedResult = await storeUpdateEmailRule(existing.id, {
      title: String(args.title ?? '').trim() || existing.title,
      status: statusRaw || existing.status,
      description: forwardTo
        ? `Forward matched mail to ${forwardTo}`
        : existing.description,
      phrases: existing.phrases,
      exceptPhrases: exceptExtra.length ? exceptExtra : existing.exceptPhrases,
      matchMode: existing.matchMode,
      fields: existing.fields,
      notify: existing.notify,
      notifyPush: existing.notifyPush,
      notifyDashboard: existing.notifyDashboard,
      notifyActions: existing.notifyActions,
      enabled: true,
      expiresAt: expiresAt === null ? existing.expiresAt ?? null : expiresAt,
      forwardTo: forwardTo ?? existing.forwardTo ?? null,
      createProject,
      scope: 'personal',
    });
    if (updatedResult.ok) {
      const updated = updatedResult.rule;
      return JSON.stringify({
        ok: true,
        updated: true,
        rule: {
          id: updated.id,
          title: updated.title,
          status: updated.status,
          scope: updated.scope,
          phrases: updated.phrases,
          fields: updated.fields,
          matchMode: updated.matchMode,
          forwardTo: updated.forwardTo ?? null,
          createProject: updated.createProject === true,
          expiresAt: updated.expiresAt ?? null,
          sortOrder: updated.sortOrder,
        },
      });
    }
    return JSON.stringify({
      error: updatedResult.error,
      colliding: updatedResult.colliding,
    });
  }

  // Sender + subject/body phrases: match across from+subject+body.
  // When both are present, require ALL phrases (sender AND "Security alert") so
  // we don't junk every message from accounts.google.com.
  const hasExtraPhrases = extra.length > 0;
  const fields: RuleField[] = sender
    ? hasExtraPhrases
      ? (['from', 'subject', 'body'] as RuleField[])
      : (['from'] as RuleField[])
    : (['subject', 'body'] as RuleField[]);
  const matchMode: MatchMode = sender && hasExtraPhrases ? 'all' : 'any';

  const created = await storeCreateEmailRule({
    title,
    status,
    description: forwardTo
      ? `Forward matched mail to ${forwardTo}`
      : 'Auto-junk — created by agent from inbox triage',
    phrases,
    exceptPhrases: exceptExtra,
    matchMode,
    fields,
    notify: false,
    enabled: true,
    expiresAt,
    forwardTo,
    createProject,
    scope: 'personal',
  });
  if (!created.ok) {
    return JSON.stringify({
      error: created.error,
      colliding: created.colliding,
    });
  }
  const rule = created.rule;
  return JSON.stringify({
    ok: true,
    rule: {
      id: rule.id,
      title: rule.title,
      status: rule.status,
      scope: rule.scope,
      phrases: rule.phrases,
      fields: rule.fields,
      matchMode: rule.matchMode,
      forwardTo: rule.forwardTo ?? null,
      createProject: rule.createProject === true,
      expiresAt: rule.expiresAt ?? null,
      sortOrder: rule.sortOrder,
    },
  });
}

async function handle_delete_email_filter_rule(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const id = String(args.id ?? '').trim();
  if (!id) return JSON.stringify({ error: 'id is required' });
  const ok = await storeDeleteEmailRule(id);
  if (!ok) return JSON.stringify({ error: 'not found or delete failed', id });
  return JSON.stringify({ ok: true, deleted: true, id });
}

export const emailInboxModule: AgentToolModule = {
  id: 'emailInbox',
  enabled: (ctx) => true,
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
          {
            type: 'function',
            function: {
              name: 'read_email_inbox',
              description:
                'Read one inbound inbox message with full headers and body. Use when you need domain names or other specifics. Defaults to the email linked to this chat when email_id is omitted.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: {
                    type: 'string',
                    description: 'Inbox message UUID — omit to use the email linked to this chat',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_email_inbox',
              description:
                `List recent inbound emails from the ${brand.name} inbox log (admin Email tab). Use when triaging mail or finding a message id by sender/subject.`,
              parameters: {
                type: 'object',
                properties: {
                  q: { type: 'string', description: 'Optional search on from, subject, or summary' },
                  include_junk: {
                    type: 'boolean',
                    description: 'Include junk-marked messages (default false)',
                  },
                  limit: { type: 'number', description: 'Max rows (default 20, max 100)' },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'mark_email_junk',
              description:
                'Mark an inbound inbox message as junk (hidden from default inbox). Requires the message id from email triage context or list_email_inbox.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'mark_email_receipt',
              description:
                'File an inbound inbox message as a tax receipt (payment confirmation, vendor charge, etc.). Use when the email shows a dollar amount and the user wants it kept for taxes — not junk/delete.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'mark_email_routed',
              description:
                'Mark an inbound inbox message as routed/processed and remove it from the review queue. Use after you have handled the email (replied, filed to a job, scheduled, etc.) — not for spam. Requires email_id from triage context or list_email_inbox.',
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'delete_email',
              description:
                `Permanently remove an inbound inbox message from the ${brand.name} inbox log. Use after marking junk when the user wants it gone, or when triage says delete/spam.`,
              parameters: {
                type: 'object',
                properties: {
                  email_id: { type: 'string', description: 'Inbox message UUID' },
                },
                required: ['email_id'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_email_filter_rules',
              description:
                'List all email triage/filter rules (both enabled and disabled). Returns id, title, status, phrases, fields, enabled flag, expiry, and whether the rule is currently expired. Use before create_email_filter_rule to check for keyword overlap (shared phrases collide even when actions differ), or when the user asks what rules exist.',
              parameters: {
                type: 'object',
                properties: {},
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_email_filter_rule',
              description:
                'Create or update a personal (this-install) triage rule so future mail from a sender or matching phrases is auto-classified. Default without forward_to is DELETE (message is filed in the Auto deleted review queue, not junk; no alert). When forward_to is set, default status is CUSTOM (Keep in inbox) and matched mail is relayed via Resend — do not junk unless the user asked to. Forwarded mail does not auto-create a project unless create_project is true. If an enabled from-rule already exists for that sender, patch it with forward_to / status / create_project instead of skipping. Keywords must be unique across rules — sharing any phrase with an existing rule (catalog or personal) is a collision even if the action differs; edit that rule instead of creating another. Sender-specific silent rules are inserted at high priority (after OTP/auth, before broad alert catch-alls). When both sender and phrases are set, matchMode is "all" across from+subject+body. Rules are indefinite by default. When the user mentions an expiration, set expires_at (ISO), expires_in_seconds, or expires_in_days. Universal catalog rules live in DEFAULT_RULES in the repo and cannot be created here.',
              parameters: {
                type: 'object',
                properties: {
                  sender: {
                    type: 'string',
                    description: 'Sender email or domain substring, e.g. upwork.com or wordpress@mdot.world',
                  },
                  phrases: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Optional extra match phrases (subject/body). Combined with sender when both are set (AND).',
                  },
                  except_phrases: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                      'Optional NOT / except phrases — if any appear in the searched fields, the rule does not match.',
                  },
                  title: {
                    type: 'string',
                    description: 'Optional rule title shown in admin Email Lab',
                  },
                  status: {
                    type: 'string',
                    description: 'Optional status tag (default DELETE — files in Auto deleted). e.g. DELETE, AUTO_ARCHIVED, JUNK',
                  },
                  scope: {
                    type: 'string',
                    enum: ['personal'],
                    description:
                      'Always personal (this install). Universal catalog rules are edited in DEFAULT_RULES in the repo.',
                  },
                  forward_to: {
                    type: 'string',
                    description:
                      'Optional email address to auto-forward matched messages to (e.g. teammate@company.com). Forwarded mail does not create a project unless create_project is true.',
                  },
                  create_project: {
                    type: 'boolean',
                    description:
                      'When true and forward_to is set, still auto-create a project from matched mail. Default false — relay only.',
                  },
                  expires_at: {
                    type: 'string',
                    description:
                      'Optional ISO timestamp when the rule should stop matching. Omit for indefinite. Use when the user gives a specific end date/time.',
                  },
                  expires_in_seconds: {
                    type: 'number',
                    description:
                      'Optional relative TTL in seconds from now (e.g. 300 for five minutes). Omit for indefinite.',
                  },
                  expires_in_days: {
                    type: 'number',
                    description:
                      'Optional relative TTL in days from now (e.g. 7 for "for a week"). Prefer this for relative durations. Omit for indefinite.',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'delete_email_filter_rule',
              description:
                'Permanently delete an email triage/filter rule by id. Use only when the user explicitly asks to remove a rule. Call list_email_filter_rules first to get the id.',
              parameters: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Rule id from list_email_filter_rules',
                  },
                },
                required: ['id'],
                additionalProperties: false,
              },
            },
          },
    ];
  },
  handlers: {
    'read_email_inbox': handle_read_email_inbox,
    'list_email_inbox': handle_list_email_inbox,
    'mark_email_junk': handle_mark_email_junk,
    'mark_email_receipt': handle_mark_email_receipt,
    'mark_email_routed': handle_mark_email_routed,
    'delete_email': handle_delete_email,
    'list_email_filter_rules': handle_list_email_filter_rules,
    'create_email_filter_rule': handle_create_email_filter_rule,
    'delete_email_filter_rule': handle_delete_email_filter_rule,
  },
};
