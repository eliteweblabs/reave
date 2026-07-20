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

async function handle_list_work(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const statusRaw = String(args.status ?? '').trim().toLowerCase();
  const status = WORK_STATUSES.includes(statusRaw as WorkStatus)
    ? (statusRaw as WorkStatus)
    : undefined;
  const jobs = await storeListWork({
    contact_uid: typeof args.contact_uid === 'string' ? args.contact_uid : undefined,
    status,
    q: typeof args.q === 'string' ? args.q : undefined,
  });
  return JSON.stringify({ jobs, count: jobs.length });
}

async function handle_read_work(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug) return JSON.stringify({ error: 'missing slug' });
  const doc = await storeReadWork(slug);
  if (!doc) {
    const known = (await storeListWork()).map((j) => j.slug);
    return JSON.stringify({ error: 'unknown slug', known });
  }
  const cap = 14_000;
  const body = doc.body.length > cap ? `${doc.body.slice(0, cap)}\n\n…(truncated)` : doc.body;
  const files = await storeListProjectFiles(slug);
  return JSON.stringify({
    slug: doc.slug,
    title: doc.title,
    client: doc.client,
    contact_uid: doc.contact_uid,
    contact_name: doc.contact_name,
    status: doc.status,
    priority: doc.priority,
    due_date: doc.due_date,
    value: doc.value,
    tags: doc.tags,
    source: doc.source,
    record_origin: doc.record_origin,
    created: doc.created,
    updated: doc.updated,
    body,
    files,
    file_count: files.length,
  });
}

async function handle_create_work(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const title = String(args.title ?? '').trim();
  const client = String(args.client ?? '').trim();
  const contactUid = String(args.contact_uid ?? '').trim();
  const contactName = String(args.contact_name ?? '').trim();
  const body = String(args.body ?? '').trim();
  const statusRaw = String(args.status ?? '').trim().toLowerCase();
  const status = WORK_STATUSES.includes(statusRaw as WorkStatus)
    ? (statusRaw as WorkStatus)
    : undefined;

  let slug = String(args.slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-');
  if (!slug && title) slug = slugFromTitle(title);

  if (!title) return JSON.stringify({ error: 'title is required' });
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
  if (await storeReadWork(slug)) return JSON.stringify({ error: 'slug already exists', slug });

  const hints = [
    client,
    ...extractClientSearchTerms(title),
    primaryClientSearchTerm(title),
  ].filter(Boolean);

  const resolution = await resolveWorkClientDecision({
    contact_uid: contactUid || undefined,
    contact_name: contactName || undefined,
    client: client || undefined,
    hints: hints.length ? [...new Set(hints)] : undefined,
  });

  if (resolution.status === 'needs_client') {
    return JSON.stringify({ needs_client: true, hint: resolution.hint, title });
  }

  if (resolution.status === 'needs_selection') {
    return JSON.stringify({
      needs_selection: true,
      reason: resolution.reason,
      candidates: resolution.candidates,
      hint: resolution.hint,
      title,
    });
  }

  const ctx = getAgentContext();
  const threadId = ctx.threadId?.trim() || '';

  const result = await storeWriteWork(slug, {
    title,
    contact_uid: resolution.uid,
    contact_name: resolution.name,
    client: resolution.name,
    status,
    body,
    record_origin: 'agent',
    source_chat_id: threadId || undefined,
    ...workExtrasFromArgs(args),
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  const doc = result.doc;
  const linked = await linkWorkFromAgentContext(doc.slug);
  return JSON.stringify({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    client: doc.client,
    contact_uid: doc.contact_uid,
    contact_name: doc.contact_name,
    status: doc.status,
    client_match: resolution.match,
    linked_chat: threadId || null,
    linked: linked.chatLinked || !!threadId,
  });
}

async function handle_link_to_work(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
  const doc = await storeReadWork(slug);
  if (!doc) return JSON.stringify({ error: 'not found', slug });

  const ctx = getAgentContext();
  const emailId = String(args.email_id ?? ctx.emailId ?? '').trim();
  const threadId = ctx.threadId?.trim() || '';

  if (threadId) await linkProjectItem(slug, 'chat', threadId);

  let attachmentsImported = 0;
  let attachmentsSkipped = 0;
  if (emailId) {
    await assignEmailToJob(emailId, slug, doc.title);
    await markInboxEmailAsProject(emailId, doc.title);
    const inbound = await storeGetEmailInbox(emailId);
    if (inbound) {
      const attachments = await importEmailAttachmentsToProject({
        emailId,
        resendEmailId: inbound.resendEmailId,
        jobSlug: slug,
        uploadedBy: ctx.userId ?? null,
      });
      attachmentsImported = attachments.imported.length;
      attachmentsSkipped = attachments.skipped;
    }
  }
  if (!threadId && !emailId) {
    return JSON.stringify({ error: 'nothing to link — open from a chat or provide email_id' });
  }
  if (threadId) await patchWorkSourceChatId(slug, threadId);

  return JSON.stringify({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    linked_email: emailId || null,
    linked_chat: threadId || null,
    attachments_imported: attachmentsImported,
    attachments_skipped: attachmentsSkipped,
  });
}

async function handle_list_project_files(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
  const doc = await storeReadWork(slug);
  if (!doc) return JSON.stringify({ error: 'not found', slug });
  const files = await storeListProjectFiles(slug);
  return JSON.stringify({
    slug: doc.slug,
    title: doc.title,
    client: doc.client,
    files,
    count: files.length,
  });
}

async function handle_add_file_to_project(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const ctx = getAgentContext();
  const images = ctx.messageImages ?? [];
  if (!images.length) {
    return JSON.stringify({
      error: 'no images in the current message — attach an image first',
    });
  }

  let slug = String(args.slug ?? '').trim();
  if (!slug) {
    const client = String(args.client ?? '').trim();
    if (!client) {
      return JSON.stringify({ error: 'provide slug or client name' });
    }
    if (!isContactApiConfigured()) {
      return JSON.stringify({ error: 'contact-api not configured' });
    }
    const resolved = await resolveContact({ name: client });
    const resolvedData =
      resolved.ok && resolved.data && typeof resolved.data === 'object'
        ? (resolved.data as { contact?: { uid?: string; name?: string }; candidates?: unknown[] })
        : null;
    const contact = resolvedData?.contact ?? null;
    if (!contact?.uid) {
      return JSON.stringify({ error: 'client not found', client, matches: resolvedData?.candidates ?? [] });
    }
    const jobs = await storeListWork({ contact_uid: contact.uid });
    if (!jobs.length) {
      return JSON.stringify({
        error: 'no projects for this client',
        client: contact.name,
        contact_uid: contact.uid,
      });
    }
    slug = jobs[0].slug;
  }

  if (!isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
  const doc = await storeReadWork(slug);
  if (!doc) return JSON.stringify({ error: 'not found', slug });

  const saved = await storeAddChatImagesToProject(slug, images, {
    uploadedBy: ctx.userId,
    sourceRef: ctx.threadId,
    source: 'agent',
  });
  if (!saved.length) return JSON.stringify({ error: 'failed to save files' });

  if (ctx.threadId) await linkProjectItem(slug, 'chat', ctx.threadId);

  return JSON.stringify({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    client: doc.client,
    files: saved,
    count: saved.length,
  });
}

async function handle_update_work(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });

  const existing = await storeReadWork(slug);
  if (!existing) {
    const known = (await storeListWork()).map((j) => j.slug);
    return JSON.stringify({ error: 'not found', known });
  }

  const title = args.title != null ? String(args.title).trim() : existing.title;
  const client =
    args.client != null ? String(args.client).trim() : existing.client || existing.contact_name;
  const body = args.body != null ? String(args.body).trim() : existing.body;
  const statusRaw = args.status != null ? String(args.status).trim().toLowerCase() : existing.status;
  const status = WORK_STATUSES.includes(statusRaw as WorkStatus)
    ? (statusRaw as WorkStatus)
    : existing.status;

  if (!title) return JSON.stringify({ error: 'title is required' });
  if (!client) return JSON.stringify({ error: 'client is required' });

  const extras = workExtrasFromArgs(args, existing);

  const result = await storeWriteWork(slug, {
    title,
    client,
    status,
    body,
    record_origin: existing.record_origin,
    priority: extras.priority,
    due_date: args.due_date != null ? extras.due_date : undefined,
    value: args.value != null ? extras.value : undefined,
    tags: args.tags != null ? extras.tags : undefined,
    source: args.source != null ? extras.source : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  const doc = result.doc;
  return JSON.stringify({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    client: doc.client,
    contact_uid: doc.contact_uid,
    contact_name: doc.contact_name,
    status: doc.status,
    updated: doc.updated,
  });
}

async function handle_toggle_work_item(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });

  const existing = await storeReadWork(slug);
  if (!existing) {
    const known = (await storeListWork()).map((j) => j.slug);
    return JSON.stringify({ error: 'not found', known });
  }

  const checked = args.checked === false ? false : true;
  let lineIndex: number | null =
    typeof args.line_index === 'number' ? args.line_index : null;

  if (lineIndex == null && args.item_text != null) {
    const match = findCheckboxByText(existing.body, String(args.item_text));
    if (!match) {
      const items = parseMarkdownCheckboxes(existing.body);
      return JSON.stringify({
        error: 'no matching checklist item',
        checklist: items.map((i) => ({ line_index: i.lineIndex, text: i.text, checked: i.checked })),
      });
    }
    lineIndex = match.lineIndex;
  }

  if (lineIndex == null) {
    return JSON.stringify({ error: 'line_index or item_text is required' });
  }

  const result = await storeToggleWorkCheckbox(slug, lineIndex, checked);
  if (!result.ok) return JSON.stringify({ error: result.error });

  const invoice_suggestions = completedItemsToInvoiceSuggestions(
    result.doc.body,
    result.doc.title,
  );
  return JSON.stringify({
    ok: true,
    slug: result.doc.slug,
    line_index: lineIndex,
    checked,
    invoice_suggestions,
    grouped_line_item: groupedInvoiceDescription(result.doc.body, result.doc.title),
  });
}

async function handle_get_work_invoice_suggestions(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });

  const doc = await storeReadWork(slug);
  if (!doc) {
    const known = (await storeListWork()).map((j) => j.slug);
    return JSON.stringify({ error: 'not found', known });
  }

  const checklist = parseMarkdownCheckboxes(doc.body);
  const invoice_suggestions = completedItemsToInvoiceSuggestions(doc.body, doc.title);
  const grouped_line_item = groupedInvoiceDescription(doc.body, doc.title);

  return JSON.stringify({
    ok: true,
    slug: doc.slug,
    title: doc.title,
    client: doc.contact_name || doc.client,
    checklist: checklist.map((i) => ({
      line_index: i.lineIndex,
      text: i.text,
      checked: i.checked,
    })),
    invoice_suggestions,
    grouped_line_item,
    hint: 'Use each suggestion description on a Crater line item (create_invoice / add_invoice_items). User still sets price.',
  });
}

async function handle_delete_work(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const slug = String(args.slug ?? '').trim();
  if (!slug || !isSafeWorkSlug(slug)) return JSON.stringify({ error: 'invalid slug' });
  if (!(await storeDeleteWork(slug))) {
    const known = (await storeListWork()).map((j) => j.slug);
    return JSON.stringify({ error: 'not found', known });
  }
  return JSON.stringify({ ok: true, slug, deleted: true });
}

export const workModule: AgentToolModule = {
  id: 'work',
  enabled: (ctx) => true,
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
          {
            type: 'function',
            function: {
              name: 'list_work',
              description:
                'List work/job records (metadata only — no full notes). Jobs live in src/knowledge/jobs/ and are tied to a contact. Use to discover open jobs; call read_work for full details when a job is referenced.',
              parameters: {
                type: 'object',
                properties: {
                  contact_uid: {
                    type: 'string',
                    description: 'Optional contact-api uid — list jobs for one client only',
                  },
                  status: {
                    type: 'string',
                    enum: [...WORK_STATUSES],
                    description: 'Optional status filter',
                  },
                  q: {
                    type: 'string',
                    description: 'Optional search on title, client name, or slug',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'read_work',
              description:
                'Read the full markdown for one work/job by slug. Loads on demand — use after list_work or when the user asks about a specific job.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Job slug (filename without .md)' },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'create_work',
              description:
                'Create a new work/job tied to a client. Prefer contact_uid when the client is confirmed. If only a name/company/phone/email is known, pass client (or hints in body/title) — the tool resolves it and returns candidates when ambiguous so you can ask the user to confirm. When no client is known yet, omit client/contact_uid; the tool tells you to ask the user using conversation context. After the user confirms, re-call with contact_uid. When called from chat, the current thread is linked automatically.',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'Job title, e.g. "New website for Acme"' },
                  contact_uid: {
                    type: 'string',
                    description: 'Confirmed client uid — preferred once the user picks or confirms a match',
                  },
                  contact_name: {
                    type: 'string',
                    description: 'Display name when passing contact_uid (optional)',
                  },
                  client: {
                    type: 'string',
                    description:
                      'Client lookup hint — name, company, phone (last 4 ok), email, website, or notes snippet. Omit when unknown; ask the user first.',
                  },
                  body: {
                    type: 'string',
                    description: 'Optional markdown notes (scope, request details, links). Omit for a blank stub.',
                  },
                  status: {
                    type: 'string',
                    enum: [...WORK_STATUSES],
                    description: 'Defaults to inquiry',
                  },
                  priority: {
                    type: 'string',
                    enum: [...WORK_PRIORITIES],
                    description: 'Defaults to normal',
                  },
                  due_date: {
                    type: 'string',
                    description: 'Optional deadline (YYYY-MM-DD)',
                  },
                  value: {
                    type: 'number',
                    description: 'Optional dollar value for the job',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Tags e.g. web-design, seo, hosting',
                  },
                  source: {
                    type: 'string',
                    description: 'Lead source — instagram, email, referral, phone, etc.',
                  },
                  slug: {
                    type: 'string',
                    description: 'Optional filename slug; derived from title if omitted',
                  },
                },
                required: ['title'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'link_to_work',
              description:
                'Link an inbox email and/or the current chat thread to an existing project/job. Use after filing mail or when a conversation relates to a job without creating a new one.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Existing job slug' },
                  email_id: {
                    type: 'string',
                    description: 'Inbox message id — defaults to the email open in this chat when omitted',
                  },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'list_project_files',
              description:
                'List media files in a project file repository (images/PDFs uploaded via chat or admin). Use when the user asks what files are on a project or before adding duplicates.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Job slug' },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'add_file_to_project',
              description:
                'Save image(s) from the current chat message to a project file repository. Use when the user says to add/save/file an image to a client project (e.g. "add this to Reggie\'s newest project"). Provide slug directly, or client name to target their most recently updated job. Images come from the current message automatically — no need to pass base64.',
              parameters: {
                type: 'object',
                properties: {
                  slug: {
                    type: 'string',
                    description: 'Target job slug — preferred when known',
                  },
                  client: {
                    type: 'string',
                    description:
                      'Client name when slug is unknown — resolves contact and uses their newest project (by updated date)',
                  },
                },
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'update_work',
              description:
                'Update an existing work/job by slug. Omitted fields are left unchanged. Re-resolves client via contact-api if client is provided.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Job slug to update' },
                  title: { type: 'string', description: 'New title' },
                  client: { type: 'string', description: 'New client name (re-resolved via contact-api)' },
                  body: { type: 'string', description: 'Replacement markdown notes (full body, not a patch)' },
                  status: {
                    type: 'string',
                    enum: [...WORK_STATUSES],
                    description: 'New status',
                  },
                  priority: {
                    type: 'string',
                    enum: [...WORK_PRIORITIES],
                    description: 'New priority',
                  },
                  due_date: {
                    type: 'string',
                    description: 'New deadline (YYYY-MM-DD)',
                  },
                  value: {
                    type: 'number',
                    description: 'New dollar value',
                  },
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Replace tags list',
                  },
                  source: {
                    type: 'string',
                    description: 'Lead source — instagram, email, referral, phone, etc.',
                  },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'toggle_work_item',
              description:
                'Check or uncheck a project action-item checkbox in job notes. Match by line_index (from read_work checklist) or item_text (substring). Use when the user says work was completed or to undo a check-off.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Job slug' },
                  line_index: { type: 'number', description: '0-based line index of the `- [ ]` row in body' },
                  item_text: {
                    type: 'string',
                    description: 'Substring match on checklist item text (when line_index unknown)',
                  },
                  checked: {
                    type: 'boolean',
                    description: 'true to mark done `[x]`, false to reopen. Defaults to true.',
                  },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'get_work_invoice_suggestions',
              description:
                'List completed project checklist items formatted as Crater invoice line-item suggestions (name + description). Use before create_invoice or add_invoice_items when billing for work tracked on a job.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Job slug' },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          },
          {
            type: 'function',
            function: {
              name: 'delete_work',
              description:
                'Permanently delete a work/job markdown file by slug. Use only when the user explicitly asks to delete/remove a job.',
              parameters: {
                type: 'object',
                properties: {
                  slug: { type: 'string', description: 'Job slug to delete' },
                },
                required: ['slug'],
                additionalProperties: false,
              },
            },
          }
    ];
  },
  handlers: {
    'list_work': handle_list_work,
    'read_work': handle_read_work,
    'create_work': handle_create_work,
    'link_to_work': handle_link_to_work,
    'list_project_files': handle_list_project_files,
    'add_file_to_project': handle_add_file_to_project,
    'update_work': handle_update_work,
    'toggle_work_item': handle_toggle_work_item,
    'get_work_invoice_suggestions': handle_get_work_invoice_suggestions,
    'delete_work': handle_delete_work,
  },
};
