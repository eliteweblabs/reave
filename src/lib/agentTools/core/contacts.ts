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

async function handle_resolve_contact(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const q = typeof args.q === 'string' ? args.q.trim() : '';
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const email = typeof args.email === 'string' ? args.email.trim() : '';
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';

  if (q && !name && !email && !phone) {
    const searched = await searchClientsEnhanced(q, 8);
    if (!searched.ok) return JSON.stringify({ error: searched.error, status: searched.status });
    const candidates = searched.data.contacts.map(formatClientCandidate);
    if (candidates.length === 1 && (candidates[0]?.score ?? 0) >= 0.85) {
      const only = candidates[0]!;
      const work_jobs = await storeListWork({ contact_uid: only.uid });
      return JSON.stringify({
        match: 'likely',
        contact: only,
        candidates,
        work_jobs,
      });
    }
    if (candidates.length) {
      return JSON.stringify({
        match: 'possible',
        candidates,
        hint: 'Ask the user to confirm which client, then use contact_uid on create_work.',
      });
    }
    return JSON.stringify({ match: 'none', candidates: [] });
  }

  const result = await resolveContactEnhanced({ name, email, phone });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });

  const contact = result.contact;
  const uid = contact?.uid ?? '';
  const work_jobs = uid ? await storeListWork({ contact_uid: uid }) : [];
  const candidates = (result.candidates ?? []).map(formatClientCandidate);

  if ((result.match === 'exact' || result.match === 'likely') && contact?.uid) {
    return JSON.stringify({
      match: result.match,
      score: result.score,
      contact: formatClientCandidate(contact),
      candidates,
      work_jobs,
    });
  }

  if (result.match === 'possible' && candidates.length) {
    return JSON.stringify({
      match: 'possible',
      candidates,
      hint: 'Ask the user to confirm which client, then use contact_uid on create_work.',
    });
  }

  return JSON.stringify({ match: 'none', candidates: [], work_jobs: [] });
}

async function handle_list_contacts(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const q = typeof args.q === 'string' ? args.q.trim() : '';
  const limit = typeof args.limit === 'number' ? args.limit : 50;
  const result = q
    ? await searchClientsEnhanced(q, limit)
    : await listContacts({ limit });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  const contacts = result.data.contacts
    .slice(0, 50)
    .map((c) => ({
      uid: c.uid,
      name: c.name,
      email: c.email ?? null,
      phone: c.phone ?? null,
      company: c.company ?? null,
      matchReason: (c as { _matchReason?: string })._matchReason ?? null,
      portal_url: clientPortalUrl(c.uid),
    }));
  return JSON.stringify({
    total: contacts.length,
    contacts,
  });
}

async function handle_create_contact(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const contactName = String(args.name ?? '').trim();
  if (!contactName) return JSON.stringify({ error: 'name is required' });
  const result = await createContact({
    name: contactName,
    email: typeof args.email === 'string' ? args.email : undefined,
    phone: typeof args.phone === 'string' ? args.phone : undefined,
    company: typeof args.company === 'string' ? args.company : undefined,
    notes: typeof args.notes === 'string' ? args.notes : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({
    success: true,
    uid: result.data.uid,
    name: result.data.name,
    email: result.data.email ?? null,
    phone: result.data.phone ?? null,
    portal_url: clientPortalUrl(result.data.uid),
  });
}

async function handle_update_contact(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const explicitUid = typeof args.uid === 'string' ? args.uid.trim() : '';
  const lookupName = typeof args.name === 'string' ? args.name.trim() : '';
  const target = explicitUid
    ? { ok: true as const, uid: explicitUid }
    : await resolvePortalTarget({
        name: lookupName || undefined,
        email: lookupName ? undefined : args.email,
        phone: lookupName ? undefined : args.phone,
      });
  if (!target.ok) return target.payload;

  const patch: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  } = {};
  if (typeof args.new_name === 'string' && args.new_name.trim()) patch.name = args.new_name.trim();
  if (typeof args.email === 'string') patch.email = args.email;
  if (typeof args.phone === 'string') patch.phone = args.phone;
  if (typeof args.company === 'string') patch.company = args.company;
  if (typeof args.notes === 'string') patch.notes = args.notes;
  if (!Object.keys(patch).length) {
    return JSON.stringify({
      error: 'Provide at least one field to update (new_name, email, phone, company, notes).',
    });
  }

  const result = await updateContact(target.uid, patch);
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  return JSON.stringify({
    success: true,
    uid: result.data.uid,
    name: result.data.name,
    email: result.data.email ?? null,
    phone: result.data.phone ?? null,
    company: result.data.company ?? null,
    notes: result.data.notes ?? null,
    portal_url: clientPortalUrl(result.data.uid),
  });
}

async function handle_delete_contact(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const uid = typeof args.uid === 'string' ? args.uid.trim() : '';
  if (!uid) return JSON.stringify({ error: 'uid is required (no fuzzy delete).' });

  const blockers = await getContactDeleteBlockers(uid);
  if (!blockers.ok) return JSON.stringify({ error: blockers.error });

  const force = args.force === true;
  const { name: contactName, project_count, invoice_count, estimate_count, projects } = blockers.data;
  if ((project_count > 0 || invoice_count > 0 || estimate_count > 0) && !force) {
    const projectWarn = project_count > 0
      ? `"${contactName}" has ${project_count} attached project(s). Deleting this client will permanently delete all attached projects.`
      : null;
    const billingReason =
      invoice_count > 0 && estimate_count > 0
        ? 'linked_invoices_and_estimates'
        : estimate_count > 0
          ? 'linked_estimates'
          : 'linked_invoices';
    return JSON.stringify({
      blocked: true,
      reason: project_count > 0 ? 'linked_projects' : billingReason,
      uid,
      contact_name: contactName,
      project_count,
      job_count: project_count,
      invoice_count,
      estimate_count,
      projects,
      warning: projectWarn,
      hint: project_count > 0
        ? 'Warn the user that all attached projects will be deleted, then re-call delete_contact with force:true to confirm.'
        : 'Warn the user about linked Crater invoices/estimates, then re-call delete_contact with force:true to confirm.',
    });
  }

  const result = await executeContactDelete(uid, { force, permanent: force });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
  const verb = force ? 'Permanently deleted' : result.already_archived ? 'Already removed' : 'Archived';
  return JSON.stringify({
    success: true,
    message: `${verb} contact "${contactName}"${result.deleted_projects ? ` and ${result.deleted_projects} attached project(s)` : ''}.`,
    uid,
    contact_name: contactName,
    deleted_projects: result.deleted_projects,
    permanent: force,
    already_archived: result.already_archived ?? false,
  });
}

export const contactsModule: AgentToolModule = {
  id: 'contacts',
  enabled: (ctx) => isContactApiConfigured(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
      {
            type: 'function',
            function: {
              name: 'resolve_contact',
              description:
                'Find a client in contact-api by name, email, phone (last 4 digits ok), company, website/domain, or notes text (e.g. "guy with a mustache"). Returns match level and candidates when fuzzy — ask the user to confirm before create_work. Use q for free-text search across all those fields.',
              parameters: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Full or partial name to match' },
                  email: { type: 'string' },
                  phone: { type: 'string', description: 'Full or partial phone — last 4 digits work' },
                  q: {
                    type: 'string',
                    description:
                      'Free-text search: company, notes snippet, website domain, phone suffix, or combined hint',
                  },
                },
                additionalProperties: false,
              },
            },
          },
            {
              type: 'function',
              function: {
                name: 'list_contacts',
                description:
                  'List or search ALL contacts in the master contact-api. Each result includes a portal_url. Optional `q` filters by name, email, company, phone (last 4 ok), website/domain, or notes text.',
                parameters: {
                  type: 'object',
                  properties: {
                    q: { type: 'string', description: 'Optional search text (name or email); omit to list all' },
                    limit: { type: 'integer', description: 'Max results (1-200, default 50)' },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'create_contact',
                description:
                  'Add a new contact/client to the master contact-api. Use when the user wants to add a client or create a test client. Returns the new contact uid and its portal_url.',
                parameters: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Full name (required)' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    company: { type: 'string' },
                    notes: { type: 'string', description: 'Private internal notes (never shown on the client portal)' },
                  },
                  required: ['name'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'update_contact',
                description:
                  "Update an existing contact's details. Identify by uid (preferred) or name (fuzzy-resolved; returns candidates if ambiguous). Only provided fields are changed.",
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid (preferred)' },
                    name: { type: 'string', description: 'Fuzzy match lookup if uid unknown' },
                    new_name: { type: 'string', description: 'Rename the contact' },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    company: { type: 'string' },
                    notes: { type: 'string', description: 'Private internal notes' },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'delete_contact',
                description:
                  'Permanently delete a contact by uid. Use only when the user explicitly asks to delete/remove a contact.',
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid to delete' },
                    force: {
                      type: 'boolean',
                      description: 'Required if contact has linked jobs/invoices',
                    },
                  },
                  required: ['uid'],
                  additionalProperties: false,
                },
              },
            }
    ];
  },
  handlers: {
    'resolve_contact': handle_resolve_contact,
    'list_contacts': handle_list_contacts,
    'create_contact': handle_create_contact,
    'update_contact': handle_update_contact,
    'delete_contact': handle_delete_contact,
  },
};
