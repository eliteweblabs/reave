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
import { syncContactToCrater } from '../../contactCraterSync';
import { setClientPortalWebsite } from '../../clientBrand';
import { enrichContactAddressFromPlaces } from '../../contactAddressFromPlaces';
import {
  isContactApiConfigured,
  listContacts,
  createContact,
  updateContact,
  getContact,
  setContactKind,
  parseClientKindInput,
  formatContactForAgent,
  hydrateContactForAgent,
  attachPortalLinksForList,
} from '../../contactApi';
import { isCanonicalReaveInstall } from '../../installConfig';
import {
  resolveContactEnhanced,
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
import { hasFeature } from '../../features';
import { resolveContactNameWrite } from '../../contactPersonName';
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
    const candidates = await Promise.all(searched.data.contacts.map((c) => hydrateContactForAgent(c)));
    if (candidates.length === 1 && (Number(candidates[0]?.score) || 0) >= 0.85) {
      const only = candidates[0]!;
      const work_jobs = await storeListWork({ contact_uid: String(only.uid ?? '') });
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
        hint: 'Ask the user to confirm which contact, then use contact_uid on create_work.',
      });
    }
    return JSON.stringify({ match: 'none', candidates: [] });
  }

  const result = await resolveContactEnhanced({ name, email, phone });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });

  const contact = result.contact;
  const uid = contact?.uid ?? '';
  const work_jobs = uid ? await storeListWork({ contact_uid: uid }) : [];
  const candidates = await Promise.all((result.candidates ?? []).map((c) => hydrateContactForAgent(c)));

  if ((result.match === 'exact' || result.match === 'likely') && contact?.uid) {
    return JSON.stringify({
      match: result.match,
      score: result.score,
      contact: await hydrateContactForAgent({
        ...contact,
        score: result.score,
      }),
      candidates,
      work_jobs,
    });
  }

  if (result.match === 'possible' && candidates.length) {
    return JSON.stringify({
      match: 'possible',
      candidates,
      hint: 'Ask the user to confirm which contact, then use contact_uid on create_work.',
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
  const rows = result.data.contacts.slice(0, 50);
  if (!q) await attachPortalLinksForList(rows);
  const contacts = rows.map((c) => formatContactForAgent(c));
  return JSON.stringify({
    total: contacts.length,
    contacts,
  });
}

async function handle_create_contact(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  const contactName = String(args.name ?? '').trim();
  if (!contactName) return JSON.stringify({ error: 'name is required' });
  const named = resolveContactNameWrite({
    name: contactName,
    company: typeof args.company === 'string' ? args.company : undefined,
    firstName: typeof args.first_name === 'string' ? args.first_name : undefined,
    lastName: typeof args.last_name === 'string' ? args.last_name : undefined,
  });
  const result = await createContact({
    name: named.name,
    email: typeof args.email === 'string' ? args.email : undefined,
    phone: typeof args.phone === 'string' ? args.phone : undefined,
    company: named.company || undefined,
    notes: typeof args.notes === 'string' ? args.notes : undefined,
  });
  if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });

  const uid = result.data.uid;
  const kind = parseClientKindInput(args.kind);

  if (kind !== 'professional') {
    const saved = await setContactKind(uid, kind);
    if (!saved.ok) return JSON.stringify({ error: saved.error });
  }

  const places = await enrichContactAddressFromPlaces(uid);

  const website = typeof args.website === 'string' ? args.website.trim() : '';
  if (website) {
    const saved = await setClientPortalWebsite(uid, website);
    if (!saved.ok) return JSON.stringify({ error: saved.error });
  } else if (kind === 'professional') {
    void import('../../contactPortalEnrich')
      .then((m) => m.triggerContactPortalEnrich(uid))
      .catch(() => {});
  }

  const contact = await hydrateContactForAgent(result.data);
  return JSON.stringify({
    success: true,
    ...contact,
    kind,
    /** Google Places business-name match — when not_listed, audits must surface it. */
    placesListing: places.listing,
    googlePlacesListed: places.listing.status === 'matched',
    ...(named.omittedInventedPersonName
      ? { first_last_omitted: true, note: named.note }
      : {}),
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

  const website = typeof args.website === 'string' ? args.website.trim() : '';
  const kindRaw = typeof args.kind === 'string' ? args.kind.trim() : '';

  const previous = await getContact(target.uid);
  if (!previous.ok) return JSON.stringify({ error: previous.error, status: previous.status });

  const named = resolveContactNameWrite({
    name: typeof args.new_name === 'string' ? args.new_name : undefined,
    company: typeof args.company === 'string' ? args.company : undefined,
    firstName: typeof args.first_name === 'string' ? args.first_name : undefined,
    lastName: typeof args.last_name === 'string' ? args.last_name : undefined,
    existingName: previous.data.name,
    existingCompany: previous.data.company,
  });
  const nameTouched =
    typeof args.new_name === 'string' ||
    typeof args.first_name === 'string' ||
    typeof args.last_name === 'string' ||
    typeof args.company === 'string';

  const patch: {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    notes?: string;
  } = {};
  if (nameTouched) {
    patch.name = named.name;
    if (named.company) patch.company = named.company;
  }
  if (typeof args.email === 'string') patch.email = args.email;
  if (typeof args.phone === 'string') patch.phone = args.phone;
  if (typeof args.notes === 'string') patch.notes = args.notes;

  const hasCoreFields = Object.keys(patch).length > 0;
  if (!hasCoreFields && !website && !kindRaw) {
    return JSON.stringify({
      error: 'Provide at least one field to update (new_name, first_name, last_name, email, phone, company, notes, website, kind).',
    });
  }

  // Update core contact fields if any were provided.
  let updatedContact = null;
  if (hasCoreFields) {
    const result = await updateContact(target.uid, patch);
    if (!result.ok) return JSON.stringify({ error: result.error, status: result.status });
    updatedContact = result.data;

    const craterSync = await syncContactToCrater(previous.data, result.data);
    if (!craterSync.ok) {
      return JSON.stringify({
        error: `Contact updated but Crater sync failed: ${craterSync.error}`,
        uid: result.data.uid,
      });
    }
  }

  // Update website in portal metadata if provided.
  if (website) {
    const saved = await setClientPortalWebsite(target.uid, website);
    if (!saved.ok) {
      return JSON.stringify({ error: `Core fields updated but website save failed: ${saved.error}` });
    }
    if (!updatedContact) {
      const current = await getContact(target.uid);
      if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
      updatedContact = current.data;
    }
  }

  let savedKind: string | undefined;
  if (kindRaw) {
    const kind = parseClientKindInput(kindRaw);
    const kindSave = await setContactKind(target.uid, kind);
    if (!kindSave.ok) return JSON.stringify({ error: kindSave.error });
    savedKind = kind;
  }

  if (!updatedContact) {
    const current = await getContact(target.uid);
    if (!current.ok) return JSON.stringify({ error: current.error, status: current.status });
    updatedContact = current.data;
  }

  const contact = await hydrateContactForAgent(updatedContact!);
  return JSON.stringify({
    success: true,
    ...contact,
    kind: savedKind ?? contact.kind ?? null,
    crater_synced: hasCoreFields ? true : undefined,
    ...(named.omittedInventedPersonName
      ? { first_last_omitted: true, note: named.note }
      : {}),
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
      ? `"${contactName}" has ${project_count} attached project(s). Deleting this contact will permanently delete all attached projects.`
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
    const kindEnum = isCanonicalReaveInstall()
      ? ['professional', 'service', 'personal', 'proposed']
      : ['professional', 'service', 'proposed'];
    const kindDescription = isCanonicalReaveInstall()
      ? 'Contact type: professional (default project client), service (vendor/service provider), personal (non-project contact), or proposed (audit/prospect).'
      : 'Contact type: professional (default project client), service (vendor/service provider), or proposed (audit/prospect).';
    return [
      {
            type: 'function',
            function: {
              name: 'resolve_contact',
              description:
                'Find a contact in contact-api by name, email, phone (last 4 digits ok), company, website/domain, or notes text (e.g. "guy with a mustache"). Returns the full contact record (including address, website, notes, portal fields) plus match level and candidates when fuzzy — ask the user to confirm before create_work. Use q for free-text search across all those fields.',
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
                  'List or search ALL contacts in the master contact-api. Each result is the full contact record (name, email, phone, company, notes, address, website, portal, portal_url, etc.). Optional `q` filters by name, email, company, phone (last 4 ok), website/domain, or notes text.',
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
                  'Add a new contact to the master contact-api. Use when the user wants to add a contact or create a test contact. For inquiry/audit prospects use kind "proposed". Pass first_name and last_name only when you found a real person. If you only know the business, put it in company (and name) and omit first/last — never split a business description into first/last. Returns the full created contact record including portal_url.',
                parameters: {
                  type: 'object',
                  properties: {
                    name: {
                      type: 'string',
                      description:
                        'Person full name if known, otherwise the business title. Required. Do not put a search snippet or dictated description here.',
                    },
                    first_name: {
                      type: 'string',
                      description:
                        "Person's given name only when found on the website or a public listing. Omit if unknown — do not invent by splitting the business name.",
                    },
                    last_name: {
                      type: 'string',
                      description:
                        "Person's family name only when found. Omit if unknown. Never a location, industry phrase, or leftover words.",
                    },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    company: { type: 'string', description: 'Business title. Use this when no person name was found.' },
                    notes: { type: 'string', description: 'Private internal notes (never shown on the client portal)' },
                    website: { type: 'string', description: 'Contact website URL, e.g. https://example.com' },
                    kind: {
                      type: 'string',
                      enum: kindEnum,
                      description: kindDescription,
                    },
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
                  "Update an existing contact's details. Identify by uid (preferred) or name (fuzzy-resolved; returns candidates if ambiguous). Only provided fields are changed. first_name/last_name/new_name are accepted only when they are a real person — invented splits (business descriptions, search snippets, Siri dictation) are dropped and first/last stay empty.",
                parameters: {
                  type: 'object',
                  properties: {
                    uid: { type: 'string', description: 'Contact uid (preferred)' },
                    name: { type: 'string', description: 'Fuzzy match lookup if uid unknown' },
                    new_name: {
                      type: 'string',
                      description:
                        'Rename to a real person full name. Do not pass a business description or search snippet.',
                    },
                    first_name: {
                      type: 'string',
                      description:
                        "Person's given name only when found on the website or a public listing. Omit if unknown.",
                    },
                    last_name: {
                      type: 'string',
                      description:
                        "Person's family name only when found. Omit if unknown. Never leftover words from a listing.",
                    },
                    email: { type: 'string' },
                    phone: { type: 'string' },
                    company: { type: 'string', description: 'Business title. Prefer this over inventing first/last.' },
                    notes: { type: 'string', description: 'Private internal notes' },
                    website: { type: 'string', description: 'Contact website URL, e.g. https://example.com' },
                    kind: {
                      type: 'string',
                      enum: kindEnum,
                      description: kindDescription,
                    },
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
