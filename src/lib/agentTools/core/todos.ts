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
  findContactByQuery,
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

async function handle_list_todos(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isTodoDbConfigured()) {
    return JSON.stringify({
      error: 'To-do list is not available — DATABASE_URL is not configured.',
    });
  }
  const statusRaw = String(args.status ?? '').trim().toLowerCase();
  const priorityRaw = String(args.priority ?? '').trim().toLowerCase();
  const status = normalizeTodoStatus(statusRaw);
  const priority = normalizeTodoPriority(priorityRaw);
  if (statusRaw && !status) return JSON.stringify({ error: 'invalid status' });
  if (priorityRaw && !priority) return JSON.stringify({ error: 'invalid priority' });
  const contactUid =
    typeof args.contact_uid === 'string' ? args.contact_uid.trim() || undefined : undefined;
  const sharedRaw = String(args.shared ?? '').trim().toLowerCase();
  const shared = sharedRaw === '1' || sharedRaw === 'true' || args.shared === true;
  const todos = await storeListTodos({
    status,
    priority,
    due_before: typeof args.due_before === 'string' ? args.due_before.trim() : undefined,
    due_after: typeof args.due_after === 'string' ? args.due_after.trim() : undefined,
    contact_uid: contactUid,
    shared: shared || undefined,
  });
  return JSON.stringify({ todos, count: todos.length });
}

async function handle_create_todo(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isTodoDbConfigured()) {
    return JSON.stringify({
      error: 'To-do list is not available — DATABASE_URL is not configured.',
    });
  }
  const title = String(args.title ?? '').trim();
  if (!title) return JSON.stringify({ error: 'title is required' });
  const priorityRaw = String(args.priority ?? '').trim().toLowerCase();
  const priority = priorityRaw
    ? normalizeTodoPriority(priorityRaw)
    : ('normal' as TodoPriority);
  if (priorityRaw && !priority) return JSON.stringify({ error: 'invalid priority' });
  const dueRaw = args.due_date;
  const due_date =
    dueRaw == null || dueRaw === '' ? null : String(dueRaw).trim();
  let contactUid =
    typeof args.contact_uid === 'string' ? args.contact_uid.trim() || null : null;
  let contactName =
    typeof args.contact_name === 'string' ? args.contact_name.trim() || null : null;
  if (!contactUid && typeof args.client === 'string' && args.client.trim()) {
    const found = await findContactByQuery(args.client.trim());
    if (!found) {
      return JSON.stringify({
        error: 'client not found',
        hint: 'Pass contact_uid from resolve_contact, or a clearer client name.',
      });
    }
    contactUid = found.uid;
    contactName = found.name || contactName;
  }
  if (contactUid && !contactName) {
    const { labelForTodoContact } = await import('../../punchlist');
    contactName = await labelForTodoContact(contactUid);
  }
  const result = await storeCreateTodo({
    title,
    due_date,
    priority,
    contact_uid: contactUid,
    contact_name: contactName,
    created_by: 'staff',
  });
  if (!result.ok) return JSON.stringify({ error: result.error });
  return JSON.stringify({ ok: true, ...result.todo });
}

async function handle_update_todo(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isTodoDbConfigured()) {
    return JSON.stringify({
      error: 'To-do list is not available — DATABASE_URL is not configured.',
    });
  }
  const id = Number(args.id);
  if (!Number.isInteger(id) || id < 1) return JSON.stringify({ error: 'invalid id' });
  const patch: {
    title?: string;
    due_date?: string | null;
    priority?: TodoPriority;
    status?: TodoStatus;
    contact_uid?: string | null;
    contact_name?: string | null;
  } = {};
  if (args.title != null) patch.title = String(args.title).trim();
  if (args.due_date !== undefined) {
    patch.due_date =
      args.due_date == null || args.due_date === '' ? null : String(args.due_date).trim();
  }
  if (args.priority != null) {
    const priority = normalizeTodoPriority(args.priority);
    if (!priority) return JSON.stringify({ error: 'invalid priority' });
    patch.priority = priority;
  }
  if (args.status != null) {
    const status = normalizeTodoStatus(args.status);
    if (!status) return JSON.stringify({ error: 'invalid status' });
    patch.status = status;
  }
  if (args.contact_uid !== undefined) {
    const uid = args.contact_uid == null || args.contact_uid === ''
      ? null
      : String(args.contact_uid).trim();
    patch.contact_uid = uid;
    if (uid) {
      const { labelForTodoContact } = await import('../../punchlist');
      patch.contact_name = await labelForTodoContact(uid);
    } else {
      patch.contact_name = null;
    }
  }
  const result = await storeUpdateTodo(id, patch);
  if (!result.ok) {
    if (result.error === 'Not found') {
      const known = (await storeListTodos()).map((t) => t.id);
      return JSON.stringify({ error: 'not found', known_ids: known });
    }
    return JSON.stringify({ error: result.error });
  }
  return JSON.stringify({ ok: true, ...result.todo });
}

async function handle_mark_todo_done(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isTodoDbConfigured()) {
    return JSON.stringify({
      error: 'To-do list is not available — DATABASE_URL is not configured.',
    });
  }
  const id = Number(args.id);
  if (!Number.isInteger(id) || id < 1) return JSON.stringify({ error: 'invalid id' });
  const result = await storeMarkTodoDone(id);
  if (!result.ok) {
    if (result.error === 'Not found') {
      const known = (await storeListTodos()).map((t) => t.id);
      return JSON.stringify({ error: 'not found', known_ids: known });
    }
    return JSON.stringify({ error: result.error });
  }
  return JSON.stringify({ ok: true, ...result.todo });
}

async function handle_delete_todo(args: Record<string, unknown>, _ctx: ToolContext): Promise<string> {
  if (!isTodoDbConfigured()) {
    return JSON.stringify({
      error: 'To-do list is not available — DATABASE_URL is not configured.',
    });
  }
  const id = Number(args.id);
  if (!Number.isInteger(id) || id < 1) return JSON.stringify({ error: 'invalid id' });
  const result = await storeDeleteTodo(id);
  if (!result.ok) {
    if (result.error === 'Not found') {
      const known = (await storeListTodos()).map((t) => t.id);
      return JSON.stringify({ error: 'not found', known_ids: known });
    }
    return JSON.stringify({ error: result.error });
  }
  return JSON.stringify({ ok: true, id, deleted: true });
}

export const todosModule: AgentToolModule = {
  id: 'todos',
  enabled: (ctx) => isTodoDbConfigured(),
  definitions(ctx: ToolContext): AgentToolDef[] {
    const brand = ctx.brand;
    const domainExample = brand.domain || 'example.com';
    void domainExample;
    return [
            {
              type: 'function',
              function: {
                name: 'list_todos',
                description:
                  'List to-do items, including shared client punch-list items (contact_uid set). Not client jobs — do not use list_work for these. Use shared:true or contact_uid to filter punch-list items.',
                parameters: {
                  type: 'object',
                  properties: {
                    status: {
                      type: 'string',
                      enum: [...TODO_STATUSES],
                      description: 'Optional filter — open or done',
                    },
                    priority: {
                      type: 'string',
                      enum: [...TODO_PRIORITIES],
                      description: 'Optional priority filter',
                    },
                    due_before: {
                      type: 'string',
                      description: 'Optional — only items due on or before this date (YYYY-MM-DD)',
                    },
                    due_after: {
                      type: 'string',
                      description: 'Optional — only items due on or after this date (YYYY-MM-DD)',
                    },
                    contact_uid: {
                      type: 'string',
                      description: 'Optional — only punch-list items for this client uid',
                    },
                    shared: {
                      type: 'boolean',
                      description: 'Optional — only items shared with a client punch list',
                    },
                  },
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'create_todo',
                description:
                  'Add a to-do item (not a client job). Pass client or contact_uid to share it on that client\'s portal punch list — it then appears on both lists. Never use create_work for personal or punch-list tasks.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', description: 'Task title' },
                    due_date: {
                      type: 'string',
                      description: 'Optional deadline (YYYY-MM-DD)',
                    },
                    priority: {
                      type: 'string',
                      enum: [...TODO_PRIORITIES],
                      description: 'Defaults to normal',
                    },
                    client: {
                      type: 'string',
                      description: 'Optional client name — shares the item on their portal punch list',
                    },
                    contact_uid: {
                      type: 'string',
                      description: 'Optional contact uid — shares the item on their portal punch list',
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
                name: 'update_todo',
                description:
                  'Update a to-do by id (title, due date, priority, status, or client share). Use list_todos first if you need the id. Pass contact_uid to share on a client punch list, or empty string to unshare.',
                parameters: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', description: 'To-do id from list_todos' },
                    title: { type: 'string', description: 'New title' },
                    due_date: {
                      type: 'string',
                      description: 'New deadline (YYYY-MM-DD), or empty string to clear',
                    },
                    priority: {
                      type: 'string',
                      enum: [...TODO_PRIORITIES],
                      description: 'New priority',
                    },
                    status: {
                      type: 'string',
                      enum: [...TODO_STATUSES],
                      description: 'open or done',
                    },
                    contact_uid: {
                      type: 'string',
                      description: 'Share on this client punch list, or empty to unshare',
                    },
                  },
                  required: ['id'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'mark_todo_done',
                description: 'Mark a personal to-do item as done by id.',
                parameters: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', description: 'To-do id from list_todos' },
                  },
                  required: ['id'],
                  additionalProperties: false,
                },
              },
            },
            {
              type: 'function',
              function: {
                name: 'delete_todo',
                description:
                  'Permanently delete a personal to-do by id. Use only when the user explicitly asks to remove a to-do.',
                parameters: {
                  type: 'object',
                  properties: {
                    id: { type: 'number', description: 'To-do id from list_todos' },
                  },
                  required: ['id'],
                  additionalProperties: false,
                },
              },
            }
    ];
  },
  handlers: {
    'list_todos': handle_list_todos,
    'create_todo': handle_create_todo,
    'update_todo': handle_update_todo,
    'mark_todo_done': handle_mark_todo_done,
    'delete_todo': handle_delete_todo,
  },
};
